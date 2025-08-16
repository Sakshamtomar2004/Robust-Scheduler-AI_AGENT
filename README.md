# AI Schedule Enforcer

An AI-powered schedule enforcement system that uses Groq's LLaMA 4 Scout vision model to verify user compliance with scheduled activities through photo verification. Built with FastAPI, LangGraph, LangChain, Pydantic, and SQLite.

## 🎯 Features

- **Schedule Management**: Create and manage scheduled tasks with custom verification requirements
- **AI-Powered Verification**: Uses Groq's vision model to analyze uploaded photos for compliance
- **LangGraph Workflow**: Implements a state-based workflow for task verification process
- **Real-time Alarms**: Audio/visual alarms that persist until verification is completed
- **SQLite Database**: Local data persistence for tasks and verification history
- **REST API**: Full REST API with automatic OpenAPI documentation
- **Background Tasks**: FastAPI background tasks for continuous monitoring

## 🏗️ Architecture

### Core Components

1. **FastAPI Application** - REST API server with automatic documentation
2. **LangGraph Workflow** - State-based verification workflow with 5 nodes:
   - Check Schedule: Compare current time with task times
   - Trigger Alarm: Activate alerts when task time arrives
   - Wait Upload: Accept photo uploads for verification
   - Groq Verify: Send photos to Groq Vision API for analysis
   - Complete/Retry: Mark complete or retry based on results
3. **SQLite Database** - Local data storage with Pydantic models
4. **Groq Vision Service** - AI-powered image verification
5. **Alarm System** - Threading-based persistent alarms

### Workflow Diagram

```
[Check Schedule] → [Task Time?] → [Trigger Alarm] → [Wait Upload]
                        ↓                              ↓
                   [Continue]                  [Photo Uploaded]
                        ↓                              ↓
                   [Monitor]  ← [Retry] ← [Failed] ← [Groq Verify]
                                                      ↓
                                              [Success] → [Complete]
```

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Groq API key (get from [console.groq.com](https://console.groq.com/))

### Installation

1. **Clone and Setup Environment**
   ```bash
   # Clone the repository (or create directory with files)
   mkdir ai-schedule-enforcer
   cd ai-schedule-enforcer

   # Create virtual environment
   python -m venv venv

   # Activate virtual environment
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment**
   ```bash
   # Copy the environment template
   cp .env.template .env

   # Edit .env file and add your Groq API key
   # GROQ_API_KEY=your_actual_api_key_here
   ```

4. **Run the Application**
   ```bash
   python main.py
   ```

The application will start at `http://127.0.0.1:8000`

## 📱 Usage

### Web Interface
Visit the deployed web application to interact with the system:
[AI Schedule Enforcer Web App](https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/18095eb70138eaed0197728b71c60b0b/eca09874-ee8b-4b54-813e-ff23e0699a7c/index.html)

### API Documentation
- **Interactive API Docs**: `http://127.0.0.1:8000/docs`
- **ReDoc Documentation**: `http://127.0.0.1:8000/redoc`

### Core API Endpoints

#### 1. Create Schedule Task
```bash
POST /schedule
Content-Type: application/json

{
  "task_name": "Wake up",
  "start_time": "06:00",
  "task_duration": 5,
  "alert_gap": 30,
  "verification_instructions": "Upload a selfie with your eyes open and face clearly visible"
}
```

#### 2. Get All Tasks
```bash
GET /schedule
```

#### 3. Upload Verification Photo
```bash
POST /verify
Content-Type: multipart/form-data

task_id: 1
image: [image_file.jpg]
```

#### 4. Get System Status
```bash
GET /status
```

### Example Usage Scenarios

#### Wake-Up Verification
1. Create task: "Wake up" at 06:00 AM
2. Instructions: "Upload selfie with eyes open"
3. At 6:00 AM, alarm triggers
4. Upload selfie → Groq AI verifies eyes are open
5. If successful → alarm stops, task completed

#### Exercise Verification  
1. Create task: "Morning workout" at 07:00 AM
2. Instructions: "Upload photo in workout clothes at exercise location"
3. At 7:00 AM, alarm triggers
4. Upload workout photo → AI verifies compliance
5. Success → task completed, failure → alarm continues

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Required: Groq API key
GROQ_API_KEY=your_groq_api_key_here

# Optional: Database configuration
DATABASE_URL=schedule_enforcer.db

# Optional: Server configuration
HOST=127.0.0.1
PORT=8000
ENVIRONMENT=development
DEBUG=true
```

### Model Configuration

The system uses `meta-llama/llama-4-scout-17b-16e-instruct` for vision analysis. You can modify the model in `main.py`:

```python
class GroqVisionService:
    def __init__(self, api_key: str):
        self.client = ChatGroq(
            api_key=api_key,
            model="meta-llama/llama-4-scout-17b-16e-instruct",  # Change model here
            temperature=0.2,
            max_tokens=1024
        )
```

## 🗂️ Project Structure

```
ai-schedule-enforcer/
├── main.py                 # Main FastAPI application
├── requirements.txt        # Python dependencies
├── .env.template          # Environment variables template
├── .env                   # Your environment configuration (create from template)
├── schedule_enforcer.db   # SQLite database (created automatically)
├── README.md              # This documentation
└── web/                   # Web interface files (if downloaded separately)
    ├── index.html
    ├── style.css
    └── app.js
```

## 🔍 Technical Details

### Database Schema

#### schedule_tasks
```sql
CREATE TABLE schedule_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name TEXT NOT NULL,
    start_time TEXT NOT NULL,           -- HH:MM format
    task_duration INTEGER NOT NULL,     -- minutes
    alert_gap INTEGER NOT NULL,         -- minutes between verifications
    verification_instructions TEXT NOT NULL,
    status TEXT DEFAULT 'pending',      -- pending, active, completed, failed
    created_at TEXT NOT NULL,
    completed_at TEXT NULL
);
```

#### verifications
```sql
CREATE TABLE verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    image_data TEXT NOT NULL,           -- base64 encoded image
    success BOOLEAN NOT NULL,
    reasoning TEXT NOT NULL,            -- AI explanation
    confidence REAL NOT NULL,           -- 0.0 to 1.0
    timestamp TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES schedule_tasks (id)
);
```

### LangGraph Workflow State

```python
class WorkflowState(BaseModel):
    task_id: int
    current_time: str
    task_start_time: str
    verification_instructions: str
    image_data: Optional[str] = None
    verification_result: Optional[Dict[str, Any]] = None
    step: str = "check_time"
    alarm_active: bool = False
```

### Image Processing

Images are processed as base64-encoded strings:
1. Upload via multipart/form-data
2. Convert to base64 for Groq API
3. Store in database for verification history
4. Send to vision model with verification instructions

## 🎮 Testing the System

### 1. Mock Mode (No API Key)
If no Groq API key is provided, the system uses mock responses:
```python
# Random mock verification responses
mock_responses = [
    {"success": True, "reasoning": "Mock: Image meets requirements", "confidence": 0.85},
    {"success": False, "reasoning": "Mock: Image doesn't meet requirements", "confidence": 0.4}
]
```

### 2. Development Testing
```bash
# Test API endpoints
curl -X POST "http://127.0.0.1:8000/schedule" \
  -H "Content-Type: application/json" \
  -d '{
    "task_name": "Test Task",
    "start_time": "14:30",
    "task_duration": 5,
    "alert_gap": 2,
    "verification_instructions": "Upload any photo for testing"
  }'

# Check system status
curl "http://127.0.0.1:8000/status"

# Health check
curl "http://127.0.0.1:8000/health"
```

### 3. Image Verification Testing
Upload test images via the web interface or API:
- Valid images: Clear photos matching requirements
- Invalid images: Blurry, wrong content, or empty images

## ⚠️ Troubleshooting

### Common Issues

1. **"GROQ_API_KEY not found"**
   - Solution: Copy `.env.template` to `.env` and add your API key

2. **Alarm not stopping**
   - Solution: Ensure verification image meets the exact requirements
   - Check verification reasoning in response

3. **Database errors**
   - Solution: Delete `schedule_enforcer.db` to reset database
   - Restart application to recreate tables

4. **Module not found errors**
   - Solution: Ensure virtual environment is activated
   - Run `pip install -r requirements.txt` again

### Logging
The application provides detailed console logging:
- Task creation and status updates
- Alarm start/stop events
- Verification attempts and results
- API request handling

## 🔒 Security Considerations

- **API Keys**: Store in environment variables, never in code
- **Image Data**: Base64 encoded images are stored in database
- **Local Database**: SQLite file should be secured in production
- **Network**: Consider HTTPS in production deployment

## 🚀 Production Deployment

For production use:

1. **Use PostgreSQL** instead of SQLite:
   ```python
   DATABASE_URL = "postgresql://user:password@host:port/database"
   ```

2. **Add Authentication**:
   - Implement JWT tokens
   - Add user management
   - Secure API endpoints

3. **Cloud Deployment**:
   - Docker containerization
   - Cloud storage for images
   - Managed database service

4. **Monitoring**:
   - Add logging framework
   - Health check endpoints
   - Performance monitoring

## 📄 License

This project is created as an educational demonstration of AI-powered applications using modern Python frameworks.

## 🤝 Contributing

This is a demonstration project. For production use, consider:
- Adding comprehensive tests
- Implementing user authentication
- Adding data validation and security measures
- Optimizing performance and scalability

## 📧 Support

For issues related to:
- **Groq API**: Visit [console.groq.com](https://console.groq.com/)
- **FastAPI**: Check [fastapi.tiangolo.com](https://fastapi.tiangolo.com/)
- **LangGraph**: See [langchain-ai.github.io/langgraph](https://langchain-ai.github.io/langgraph/)

---

**Built with ❤️ using FastAPI, LangGraph, Groq, and modern AI technologies**
