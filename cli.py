#!/usr/bin/env python3
"""
AI Schedule Enforcer CLI Interface

Command-line interface for managing tasks and testing the system.
"""

import os
import sys
import json
import asyncio
import base64
from datetime import datetime, timedelta
from pathlib import Path
import argparse

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def load_environment():
    """Load environment variables"""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        return True
    except ImportError:
        print("❌ python-dotenv not installed")
        return False

def create_test_task():
    """Create a test task for demonstration"""
    try:
        from main import DatabaseManager, ScheduleTask

        db = DatabaseManager("schedule_enforcer.db")

        # Create a task for 2 minutes from now
        future_time = (datetime.now() + timedelta(minutes=2)).strftime("%H:%M")

        test_task = ScheduleTask(
            task_name="CLI Test Task",
            start_time=future_time,
            task_duration=5,
            alert_gap=1,
            verification_instructions="Upload any photo to test the verification system"
        )

        task_id = db.create_task(test_task)
        print(f"✅ Created test task with ID {task_id}")
        print(f"📅 Task scheduled for: {future_time}")
        print("⏰ The alarm will trigger in 2 minutes!")

        return task_id

    except Exception as e:
        print(f"❌ Error creating test task: {e}")
        return None

def list_tasks():
    """List all scheduled tasks"""
    try:
        from main import DatabaseManager

        db = DatabaseManager("schedule_enforcer.db")
        tasks = db.get_all_tasks()

        if not tasks:
            print("📝 No scheduled tasks found")
            return

        print("\n📋 Scheduled Tasks:")
        print("-" * 60)

        for task in tasks:
            status_emoji = {
                "pending": "⏳",
                "active": "🔥", 
                "completed": "✅",
                "failed": "❌"
            }.get(task["status"], "❓")

            print(f"{status_emoji} Task {task['id']}: {task['task_name']}")
            print(f"   ⏰ Time: {task['start_time']} ({task['task_duration']} min)")
            print(f"   📋 Instructions: {task['verification_instructions'][:50]}...")
            print(f"   📊 Status: {task['status']}")
            print()

    except Exception as e:
        print(f"❌ Error listing tasks: {e}")

def check_system_status():
    """Check system status"""
    try:
        from main import DatabaseManager

        db = DatabaseManager("schedule_enforcer.db")
        tasks = db.get_all_tasks()
        current_time = datetime.now().strftime("%H:%M")

        active_tasks = [t for t in tasks if t["status"] == "active"]
        completed_tasks = [t for t in tasks if t["status"] == "completed"]
        pending_tasks = [t for t in tasks if t["status"] == "pending"]

        print("\n📊 System Status")
        print("-" * 30)
        print(f"🕐 Current Time: {current_time}")
        print(f"📝 Total Tasks: {len(tasks)}")
        print(f"⏳ Pending: {len(pending_tasks)}")
        print(f"🔥 Active: {len(active_tasks)}")
        print(f"✅ Completed: {len(completed_tasks)}")
        print(f"🔑 Groq API: {'✅ Configured' if os.getenv('GROQ_API_KEY') else '❌ Not configured'}")

        if active_tasks:
            print("\n🚨 Active Tasks (Need Verification):")
            for task in active_tasks:
                print(f"   • {task['task_name']} (ID: {task['id']})")

    except Exception as e:
        print(f"❌ Error checking status: {e}")

def simulate_verification(task_id):
    """Simulate a verification for testing"""
    try:
        from main import DatabaseManager
        import random

        db = DatabaseManager("schedule_enforcer.db")
        task = db.get_task(task_id)

        if not task:
            print(f"❌ Task {task_id} not found")
            return

        if task["status"] not in ["active", "pending"]:
            print(f"❌ Task {task_id} is not active for verification")
            return

        # Create mock image data
        mock_image = b"mock_image_data_for_testing_purposes"
        image_b64 = base64.b64encode(mock_image).decode("utf-8")

        # Simulate verification
        success = random.choice([True, False])
        reasoning = (
            "Mock verification: Image meets the requirements" if success 
            else "Mock verification: Image does not meet requirements"
        )
        confidence = random.uniform(0.7, 0.95) if success else random.uniform(0.1, 0.4)

        # Store verification
        db.store_verification(
            task_id, 
            image_b64, 
            success, 
            reasoning, 
            confidence
        )

        # Update task status
        if success:
            db.update_task_status(task_id, "completed", datetime.now().isoformat())
            print(f"✅ Task {task_id} verification successful!")
            print(f"💭 Reasoning: {reasoning}")
        else:
            print(f"❌ Task {task_id} verification failed!")
            print(f"💭 Reasoning: {reasoning}")
            print("🔄 Task remains active for retry")

        print(f"📊 Confidence: {confidence:.2f}")

    except Exception as e:
        print(f"❌ Error simulating verification: {e}")

def start_server():
    """Start the FastAPI server"""
    try:
        import uvicorn
        print("🚀 Starting AI Schedule Enforcer server...")
        print("📱 Web Interface: http://127.0.0.1:8000")
        print("📖 API Docs: http://127.0.0.1:8000/docs")
        print("🛑 Press Ctrl+C to stop")

        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
    except Exception as e:
        print(f"❌ Error starting server: {e}")

def main():
    """Main CLI function"""
    parser = argparse.ArgumentParser(
        description="AI Schedule Enforcer CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python cli.py status              # Check system status
  python cli.py list               # List all tasks  
  python cli.py create-test        # Create a test task
  python cli.py verify 1           # Simulate verification for task 1
  python cli.py server             # Start the web server
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Status command
    subparsers.add_parser("status", help="Check system status")

    # List command
    subparsers.add_parser("list", help="List all scheduled tasks")

    # Create test task command
    subparsers.add_parser("create-test", help="Create a test task")

    # Verify command
    verify_parser = subparsers.add_parser("verify", help="Simulate verification")
    verify_parser.add_argument("task_id", type=int, help="Task ID to verify")

    # Server command
    subparsers.add_parser("server", help="Start the web server")

    args = parser.parse_args()

    # Load environment
    if not load_environment():
        print("⚠️  Warning: Could not load environment variables")

    # Print header
    print("🤖 AI Schedule Enforcer CLI")
    print("=" * 40)

    # Execute command
    if args.command == "status":
        check_system_status()
    elif args.command == "list":
        list_tasks()
    elif args.command == "create-test":
        create_test_task()
    elif args.command == "verify":
        simulate_verification(args.task_id)
    elif args.command == "server":
        start_server()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
