
import os
import asyncio
import threading
import time
import base64
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import sqlite3
from contextlib import asynccontextmanager
import json
from fastapi.responses import FileResponse


from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv
import uvicorn
from playsound import playsound
import io

# LangGraph and LangChain imports
from langgraph.graph import StateGraph, END, START
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from fastapi.staticfiles import StaticFiles 
# Load environment variables
load_dotenv()

# Database setup
DATABASE_URL = "schedule_enforcer.db"

# Pydantic models
class ScheduleTask(BaseModel):
    task_name: str = Field(..., min_length=1, max_length=100)
    start_time: str = Field(..., pattrn=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")  # HH:MM format
    task_duration: int = Field(..., ge=1, le=1440)  # minutes, max 24 hours
    alert_gap: int = Field(..., ge=1, le=60)  # minutes between verifications
    verification_instructions: str = Field(..., min_length=10, max_length=500)

    @validator("start_time")
    def validate_start_time(cls, v):
        try:
            datetime.strptime(v, "%H:%M")
            return v
        except ValueError:
            raise ValueError("Invalid time format. Use HH:MM (24-hour format)")

class ScheduleTaskResponse(BaseModel):
    id: int
    task_name: str
    start_time: str
    task_duration: int
    alert_gap: int
    verification_instructions: str
    status: str
    created_at: str
    completed_at: Optional[str] = None

class VerificationRequest(BaseModel):
    task_id: int
    image_data: str  # base64 encoded image

class VerificationResponse(BaseModel):
    success: bool
    reasoning: str
    confidence: float
    timestamp: str

# State for LangGraph workflow
class WorkflowState(BaseModel):
    task_id: int
    current_time: str
    task_start_time: str
    verification_instructions: str
    image_data: Optional[str] = None
    verification_result: Optional[Dict[str, Any]] = None
    step: str = "check_time"
    alarm_active: bool = False

# Database operations
class DatabaseManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schedule_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_name TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    task_duration INTEGER NOT NULL,
                    alert_gap INTEGER NOT NULL,
                    verification_instructions TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    completed_at TEXT NULL
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS verifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    image_data TEXT NOT NULL,
                    success BOOLEAN NOT NULL,
                    reasoning TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES schedule_tasks (id)
                )
            """)
            conn.commit()

    def create_task(self, task: ScheduleTask) -> int:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO schedule_tasks 
                (task_name, start_time, task_duration, alert_gap, verification_instructions, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                task.task_name, 
                task.start_time, 
                task.task_duration, 
                task.alert_gap, 
                task.verification_instructions,
                datetime.now().isoformat()
            ))
            return cursor.lastrowid
    def delete_task(self, task_id: int) -> bool:
        """Delete a task and its verifications"""
        with sqlite3.connect(self.db_path) as conn:
        # Delete verifications first
          conn.execute("DELETE FROM verifications WHERE task_id = ?", (task_id,))
        # Delete task
          cursor = conn.execute("DELETE FROM schedule_tasks WHERE id = ?", (task_id,))
          conn.commit()
          return cursor.rowcount > 0
    

    def get_all_tasks(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM schedule_tasks ORDER BY start_time")
            return [dict(row) for row in cursor.fetchall()]

    def get_task(self, task_id: int) -> Optional[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM schedule_tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_task_status(self, task_id: int, status: str, completed_at: Optional[str] = None):
        with sqlite3.connect(self.db_path) as conn:
            if completed_at:
                conn.execute(
                    "UPDATE schedule_tasks SET status = ?, completed_at = ? WHERE id = ?",
                    (status, completed_at, task_id)
                )
            else:
                conn.execute(
                    "UPDATE schedule_tasks SET status = ? WHERE id = ?",
                    (status, task_id)
                )
            conn.commit()

    def store_verification(self, task_id: int, image_data: str, success: bool, reasoning: str, confidence: float):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO verifications 
                (task_id, image_data, success, reasoning, confidence, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (task_id, image_data, success, reasoning, confidence, datetime.now().isoformat()))
            conn.commit()

# Groq Vision Service
class GroqVisionService:
    def __init__(self, api_key: str):
        self.client = ChatGroq(
            api_key=api_key,
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            temperature=0.2,
            max_tokens=1024
        )

    async def verify_image(self, image_data: str, instructions: str) -> VerificationResponse:
        try:
            # Create the vision prompt
            message = HumanMessage(
                content=[
                    {
                        "type": "text",
                        "text": f"""Please analyze this image for compliance with the following verification instructions: "{instructions}"

Return your response in this exact JSON format:
{{
    "success": true/false,
    "reasoning": "detailed explanation of what you see and why it passes/fails verification",
    "confidence": 0.0-1.0
}}

Focus on:
1. Whether the image meets the specific requirements in the instructions
2. The clarity and quality of the image
3. Any relevant details that support or contradict the requirements
4.Return only raw JSON without any markdown formatting or code fences.
5.Confidence should be low if picture doesn't match with verification and should be hoh if it matches.
"""
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_data}"
                        }
                    }
                ]
            )

            # Get response from Groq
            response = await self.client.ainvoke([message])

            # Parse the JSON response
            try:
                result = json.loads(response.content)
                return VerificationResponse(
                    success=result["success"],
                    reasoning=result["reasoning"],
                    confidence=result["confidence"],
                    timestamp=datetime.now().isoformat()
                )
            except (json.JSONDecodeError, KeyError) as e:
                # Fallback if JSON parsing fails
                return VerificationResponse(
                    success=False,
                    reasoning=f"Error processing verification: {str(e)}. Response was: {response.content}",
                    confidence=0.0,
                    timestamp=datetime.now().isoformat()
                )

        except Exception as e:
            return VerificationResponse(
                success=False,
                reasoning=f"Groq API error: {str(e)}",
                confidence=0.0,
                timestamp=datetime.now().isoformat()
            )

class AlarmSystem:
    def __init__(self):
        self.active_alarms: Dict[int, threading.Event] = {}
        self.alarm_threads: Dict[int, threading.Thread] = {}
        self.warning_alerts: Dict[int, threading.Event] = {}

    def start_alarm(self, task_id: int, task_name: str):
        if task_id in self.active_alarms:
            return # Alarm already active

        stop_event = threading.Event()
        self.active_alarms[task_id] = stop_event

        def alarm_loop():
            print(f"\n🚨 ALARM ACTIVE for task: {task_name} 🚨")
            alert_count = 0
            while not stop_event.wait(timeout=2): # Check every 2 seconds
                alert_count += 1
                print(f"⏰ ATTENTION: Complete verification for '{task_name}'! (Alert #{alert_count})")
                
                # Play actual alarm sound if file exists
                try:
                    playsound("web/alarm.wav", block=False)
                except Exception as e:
                    print(f"Could not play alarm sound: {e}")

        alarm_thread = threading.Thread(target=alarm_loop, daemon=True)
        self.alarm_threads[task_id] = alarm_thread
        alarm_thread.start()
        print(f"Alarm started for task {task_id}: {task_name}")

    def start_warning_alert(self, task_id: int, task_name: str, minutes_until: int):
        """Start warning alert before task begins"""
        if task_id in self.warning_alerts:
            return
            
        stop_event = threading.Event()
        self.warning_alerts[task_id] = stop_event
        
        def warning_loop():
            print(f"\n⚠️ WARNING: Task '{task_name}' starts in {minutes_until} minutes!")
            print(f"🔄 Get ready to verify with camera when task becomes active.")
            # You can add sound here too
            
        warning_thread = threading.Thread(target=warning_loop, daemon=True)
        warning_thread.start()

    def stop_alarm(self, task_id: int):
        if task_id in self.active_alarms:
            self.active_alarms[task_id].set()
            del self.active_alarms[task_id]

        if task_id in self.alarm_threads:
            del self.alarm_threads[task_id]

        if task_id in self.warning_alerts:
            self.warning_alerts[task_id].set()
            del self.warning_alerts[task_id]

        print(f"Alarm stopped for task {task_id}")

    def is_alarm_active(self, task_id: int) -> bool:
        return task_id in self.active_alarms


# LangGraph Workflow
def create_verification_workflow(db: DatabaseManager, groq_service: GroqVisionService, alarm_system: AlarmSystem):

    async def check_schedule_node(state: WorkflowState) -> WorkflowState:
        current_time = datetime.now().strftime("%H:%M")
        state.current_time = current_time

        # Check if current time matches task start time
        if current_time == state.task_start_time:
            state.step = "trigger_alarm"
            state.alarm_active = True
        else:
            state.step = "check_time"

        return state

    async def trigger_alarm_node(state: WorkflowState) -> WorkflowState:
        if state.alarm_active and not alarm_system.is_alarm_active(state.task_id):
            task = db.get_task(state.task_id)
            if task:
                alarm_system.start_alarm(state.task_id, task["task_name"])
                db.update_task_status(state.task_id, "active")

        state.step = "wait_upload"
        return state

    async def wait_upload_node(state: WorkflowState) -> WorkflowState:
        # This node waits for image upload (handled by API endpoint)
        if state.image_data:
            state.step = "groq_verify"
        return state

    async def groq_verify_node(state: WorkflowState) -> WorkflowState:
        if state.image_data:
            verification_result = await groq_service.verify_image(
                state.image_data, 
                state.verification_instructions
            )

            state.verification_result = verification_result.dict()

            # Store verification in database
            db.store_verification(
                state.task_id,
                state.image_data,
                verification_result.success,
                verification_result.reasoning,
                verification_result.confidence
            )

            state.step = "complete_retry"

        return state

    async def complete_retry_node(state: WorkflowState) -> WorkflowState:
        if state.verification_result and state.verification_result["success"]:
            # Verification successful - stop alarm and mark complete
            alarm_system.stop_alarm(state.task_id)
            db.update_task_status(state.task_id, "completed", datetime.now().isoformat())
            state.step = "end"
        else:
            # Verification failed - continue alarm and wait for retry
            state.step = "wait_upload"
            state.image_data = None  # Clear image data for retry

        return state

    # Build the workflow graph
    workflow = StateGraph(WorkflowState)

    # Add nodes
    workflow.add_node("check_time", check_schedule_node)
    workflow.add_node("trigger_alarm", trigger_alarm_node) 
    workflow.add_node("wait_upload", wait_upload_node)
    workflow.add_node("groq_verify", groq_verify_node)
    workflow.add_node("complete_retry", complete_retry_node)

    # Add edges
    workflow.set_entry_point("check_time")

    workflow.add_conditional_edges(
        "check_time",
        lambda state: "trigger_alarm" if state.step == "trigger_alarm" else "check_time",
        {
            "trigger_alarm": "trigger_alarm",
            "check_time": "check_time"
        }
    )

    workflow.add_edge("trigger_alarm", "wait_upload")

    workflow.add_conditional_edges(
        "wait_upload",
        lambda state: "groq_verify" if state.step == "groq_verify" else "wait_upload",
        {
            "groq_verify": "groq_verify",
            "wait_upload": "wait_upload"
        }
    )

    workflow.add_edge("groq_verify", "complete_retry")

    workflow.add_conditional_edges(
        "complete_retry",
        lambda state: END if state.step == "end" else "wait_upload",
        {
            END: END,
            "wait_upload": "wait_upload"
        }
    )

    return workflow.compile()

# Initialize services
db = DatabaseManager(DATABASE_URL)
groq_api_key = os.getenv("GROQ_API_KEY")
if not groq_api_key:
    print("WARNING: GROQ_API_KEY not found in environment variables. Using mock responses.")
    groq_service = None
else:
    groq_service = GroqVisionService(groq_api_key)

alarm_system = AlarmSystem()

# Task scheduler
class TaskScheduler:
    def __init__(self):
        self.running = True
        self.active_tasks: Dict[int, WorkflowState] = {}
        self.workflow = create_verification_workflow(db, groq_service, alarm_system) if groq_service else None

    def start_monitoring(self):
        def monitor_loop():
            while self.running:
                current_time = datetime.now().strftime("%H:%M")

                # Check for tasks that should be starting
                tasks = db.get_all_tasks()
                for task in tasks:
                    if (task["status"] == "pending" and 
                        task["start_time"] == current_time and 
                        task["id"] not in self.active_tasks):

                        # Start workflow for this task
                        state = WorkflowState(
                            task_id=task["id"],
                            task_start_time=task["start_time"],
                            verification_instructions=task["verification_instructions"],
                            current_time=current_time
                        )

                        self.active_tasks[task["id"]] = state
                        print(f"Started monitoring task {task['id']}: {task['task_name']}")

                time.sleep(30)  # Check every 30 seconds

        monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        monitor_thread.start()

    def process_verification(self, task_id: int, image_data: str) -> Optional[VerificationResponse]:
        if task_id in self.active_tasks:
            self.active_tasks[task_id].image_data = image_data

            # Mock verification if no Groq service
            if not groq_service:
                import random
                mock_responses = [
                    VerificationResponse(
                        success=True,
                        reasoning="Mock verification: Image meets requirements",
                        confidence=0.9,
                        timestamp=datetime.now().isoformat()
                    ),
                    VerificationResponse(
                        success=False,
                        reasoning="Mock verification: Image does not meet requirements",
                        confidence=0.3,
                        timestamp=datetime.now().isoformat()
                    )
                ]
                return random.choice(mock_responses)

            # In real implementation, this would trigger the workflow
            return None

    def stop_monitoring(self):
        self.running = False
        for task_id in list(self.active_tasks.keys()):
            alarm_system.stop_alarm(task_id)

# Initialize scheduler
scheduler = TaskScheduler()

# FastAPI application
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    scheduler.start_monitoring()
    print("AI Schedule Enforcer started successfully!")
    print(f"Database initialized at: {DATABASE_URL}")
    print(f"Groq API Key {'configured' if groq_api_key else 'NOT CONFIGURED - using mock responses'}")

    yield

    # Shutdown
    scheduler.stop_monitoring()
    print("Scheduler stopped")

# Create FastAPI app
app = FastAPI(
    title="AI Schedule Enforcer",
    description="AI-powered schedule enforcer using Groq LLM for visual verification",
    version="1.0.0",
    lifespan=lifespan
)


# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/", StaticFiles(directory="web", html=True), name="static")

@app.get("/", include_in_schema=False)
async def root():
   return FileResponse("web/index.html")

# API Routes
@app.post("/schedule", response_model=ScheduleTaskResponse)
async def create_schedule_task(task: ScheduleTask):
    """Add a new schedule task"""
    try:
        task_id = db.create_task(task)
        created_task = db.get_task(task_id)
        return ScheduleTaskResponse(**created_task)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/schedule", response_model=List[ScheduleTaskResponse])
async def get_all_tasks():
    """Get all scheduled tasks"""
    try:
        tasks = db.get_all_tasks()
        return [ScheduleTaskResponse(**task) for task in tasks]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.delete("/schedule/{task_id}")
async def delete_task(task_id: int):
    """Delete a task permanently from database"""
    try:
        # Check if task exists
        task = db.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # Stop any active alarm for this task
        if alarm_system.is_alarm_active(task_id):
            alarm_system.stop_alarm(task_id)
        
        # Remove from active tasks if present
        if task_id in scheduler.active_tasks:
            del scheduler.active_tasks[task_id]
        
        # Delete from database
        with sqlite3.connect(DATABASE_URL) as conn:
            # Delete associated verifications first (foreign key constraint)
            conn.execute("DELETE FROM verifications WHERE task_id = ?", (task_id,))
            # Delete the task
            cursor = conn.execute("DELETE FROM schedule_tasks WHERE id = ?", (task_id,))
            conn.commit()
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Task not found")
        
        return {"message": "Task deleted successfully", "task_id": task_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/verify", response_model=VerificationResponse)
async def verify_task(
    task_id: int = Form(...),
    image: UploadFile = File(...)
):
    """Upload image for task verification"""
    try:
        # Validate task exists and is active
        task = db.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task["status"] not in ["active", "pending"]:
            raise HTTPException(status_code=400, detail="Task is not active for verification")

        # Read and encode image
        image_content = await image.read()
        image_data = base64.b64encode(image_content).decode("utf-8")

        # Process verification
        if groq_service:
            verification_result = await groq_service.verify_image(
                image_data, 
                task["verification_instructions"]
            )
        else:
            # Mock response for testing
            import random
            mock_responses = [
                VerificationResponse(
                    success=True,
                    reasoning="Mock verification: Image appears to meet the requirements for this task",
                    confidence=0.85,
                    timestamp=datetime.now().isoformat()
                ),
                VerificationResponse(
                    success=False,
                    reasoning="Mock verification: Image does not clearly meet the verification requirements",
                    confidence=0.4,
                    timestamp=datetime.now().isoformat()
                )
            ]
            verification_result = random.choice(mock_responses)

        # Store verification
        db.store_verification(
            task_id,
            image_data,
            verification_result.success,
            verification_result.reasoning,
            verification_result.confidence
        )

        # Update task status based on verification
        if verification_result.success:
            alarm_system.stop_alarm(task_id)
            db.update_task_status(task_id, "completed", datetime.now().isoformat())

        return verification_result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status")
async def get_status():
    """Get current system status"""
    try:
        tasks = db.get_all_tasks()
        current_time = datetime.now().strftime("%H:%M")

        active_tasks = [task for task in tasks if task["status"] == "active"]
        completed_tasks = [task for task in tasks if task["status"] == "completed"]
        pending_tasks = [task for task in tasks if task["status"] == "pending"]

        return {
            "current_time": current_time,
            "total_tasks": len(tasks),
            "active_tasks": len(active_tasks),
            "completed_tasks": len(completed_tasks),
            "pending_tasks": len(pending_tasks),
            "active_alarms": len(alarm_system.active_alarms),
            "groq_configured": groq_api_key is not None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": "connected",
            "groq_api": "configured" if groq_api_key else "not_configured",
            "alarm_system": "active"
        }
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )

