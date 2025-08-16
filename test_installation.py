#!/usr/bin/env python3
"""
AI Schedule Enforcer Test Script

This script tests the basic functionality of the application.
"""

import os
import sys
import json
import asyncio
from datetime import datetime, timedelta
import sqlite3
from pathlib import Path
import time

def test_imports():
    """Test that all required modules can be imported"""
    print("🧪 Testing imports...")

    try:
        # Test core dependencies
        import fastapi
        import pydantic
        import uvicorn
        import sqlite3
        from dotenv import load_dotenv
        print("✅ Core dependencies imported successfully")

        # Test LangChain/LangGraph
        import langchain_core
        import langchain_groq  
        import langgraph
        print("✅ LangChain/LangGraph dependencies imported successfully")

        return True
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("💡 Try running: pip install -r requirements.txt")
        return False

def test_environment():
    """Test environment configuration"""
    print("\n🧪 Testing environment configuration...")

    env_file = Path(".env")
    if not env_file.exists():
        print("❌ .env file not found")
        print("💡 Create .env from template: cp .env.template .env")
        return False

    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()

    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key or groq_key == "your_groq_api_key_here":
        print("⚠️  GROQ_API_KEY not configured (will use mock responses)")
    else:
        print("✅ GROQ_API_KEY configured")

    print("✅ Environment configuration checked")
    return True



def test_database():
    print("\n🧪 Testing database functionality...")
    test_db = "test_schedule.db"

    # Remove any leftover test DB
    if os.path.exists(test_db):
        os.remove(test_db)

    # Step 1: Create and use the DB
    conn = sqlite3.connect(test_db)
    cursor = conn.cursor()
    cursor.execute("""
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
    cursor.execute("""
        INSERT INTO schedule_tasks
          (task_name, start_time, task_duration, alert_gap,
           verification_instructions, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, ("Test Task", "12:00", 5, 10, "Test instructions", datetime.now().isoformat()))
    conn.commit()

    # Step 2: Verify data
    cursor.execute("SELECT COUNT(*) FROM schedule_tasks")
    count = cursor.fetchone()[0]
    if count == 1:
        print("✅ Database operations working correctly")
        success = True
    else:
        print("❌ Database operations failed")
        success = False

    # Step 3: Close the connection before cleanup
    cursor.close()
    conn.close()

    # (Optional) give Windows a split second to release file lock
    time.sleep(0.1)

    # Step 4: Delete the test DB
    try:
        os.remove(test_db)
    except PermissionError as e:
        print(f"❌ Cleanup failed, file still locked: {e}")
        success = False

    return success


def test_pydantic_models():
    """Test Pydantic model validation"""
    print("\n🧪 Testing Pydantic models...")

    try:
        from pydantic import BaseModel, Field, ValidationError

        # Test valid data
        valid_task = {
            "task_name": "Test Task",
            "start_time": "14:30",
            "task_duration": 15,
            "alert_gap": 5,
            "verification_instructions": "Upload a test photo for verification purposes"
        }

        # Create a simple test model
        class TestTask(BaseModel):
            task_name: str = Field(..., min_length=1)
            start_time: str
            task_duration: int = Field(..., ge=1)
            alert_gap: int = Field(..., ge=1)
            verification_instructions: str = Field(..., min_length=10)

        task = TestTask(**valid_task)
        print("✅ Pydantic model validation working")

        # Test invalid data
        try:
            invalid_task = valid_task.copy()
            invalid_task["task_duration"] = -1  # Invalid
            TestTask(**invalid_task)
            print("❌ Pydantic validation not working (should have failed)")
            return False
        except ValidationError:
            print("✅ Pydantic validation correctly caught invalid data")

        return True

    except Exception as e:
        print(f"❌ Pydantic model error: {e}")
        return False

def test_time_parsing():
    """Test time parsing functionality"""
    print("\n🧪 Testing time parsing...")

    try:
        from datetime import datetime

        # Test valid time formats
        valid_times = ["00:00", "12:30", "23:59", "06:15"]
        for time_str in valid_times:
            parsed = datetime.strptime(time_str, "%H:%M")
            assert parsed is not None

        print("✅ Time parsing working correctly")
        return True

    except Exception as e:
        print(f"❌ Time parsing error: {e}")
        return False

def test_mock_verification():
    """Test mock verification system"""
    print("\n🧪 Testing mock verification system...")

    try:
        import random
        import base64

        # Create mock image data
        test_image = b"fake_image_data_for_testing"
        image_b64 = base64.b64encode(test_image).decode("utf-8")

        # Mock verification responses
        mock_responses = [
            {"success": True, "reasoning": "Test verification successful", "confidence": 0.9},
            {"success": False, "reasoning": "Test verification failed", "confidence": 0.3}
        ]

        response = random.choice(mock_responses)
        assert "success" in response
        assert "reasoning" in response
        assert "confidence" in response

        print("✅ Mock verification system working")
        return True

    except Exception as e:
        print(f"❌ Mock verification error: {e}")
        return False

def run_all_tests():
    """Run all tests and report results"""
    print("🚀 AI Schedule Enforcer - System Tests")
    print("=" * 50)

    tests = [
        ("Module Imports", test_imports),
        ("Environment Config", test_environment),
        ("Database Operations", test_database), 
        ("Pydantic Models", test_pydantic_models),
        ("Time Parsing", test_time_parsing),
        ("Mock Verification", test_mock_verification)
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")

    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed! Your installation is ready.")
        print("\n💡 Next steps:")
        print("1. Add your Groq API key to .env file")
        print("2. Run: python main.py")
        print("3. Open: http://127.0.0.1:8000")
    else:
        print("⚠️  Some tests failed. Please check the errors above.")
        if passed < total // 2:
            print("💡 Try running: pip install -r requirements.txt")

    print("=" * 50)

if __name__ == "__main__":
    run_all_tests()
