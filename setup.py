#!/usr/bin/env python3
"""
AI Schedule Enforcer Setup Script

This script helps you set up the AI Schedule Enforcer application quickly.
"""

import os
import subprocess
import sys
import shutil
from pathlib import Path

def run_command(command, description):
    """Run a shell command and handle errors"""
    print(f"\n🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        print(f"Error output: {e.stderr}")
        return False

def check_python_version():
    """Check if Python version is adequate"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8 or higher is required")
        print(f"Current version: {version.major}.{version.minor}.{version.micro}")
        return False
    print(f"✅ Python version {version.major}.{version.minor}.{version.micro} is compatible")
    return True

def setup_virtual_environment():
    """Create and activate virtual environment"""
    venv_path = Path("venv")

    if venv_path.exists():
        print("📁 Virtual environment already exists")
        return True

    return run_command(f"{sys.executable} -m venv venv", "Creating virtual environment")

def install_dependencies():
    """Install Python dependencies"""
    if os.name == 'nt':  # Windows
        pip_cmd = "venv\\Scripts\\pip install -r requirements.txt"
    else:  # macOS/Linux
        pip_cmd = "venv/bin/pip install -r requirements.txt"

    return run_command(pip_cmd, "Installing dependencies")

def setup_environment_file():
    """Create .env file from template"""
    env_file = Path(".env")
    template_file = Path(".env.template")

    if env_file.exists():
        print("📁 .env file already exists")
        return True

    if not template_file.exists():
        print("❌ .env.template file not found")
        return False

    try:
        shutil.copy(template_file, env_file)
        print("✅ Created .env file from template")
        print("⚠️  IMPORTANT: Edit .env file and add your GROQ_API_KEY")
        return True
    except Exception as e:
        print(f"❌ Failed to create .env file: {e}")
        return False

def print_next_steps():
    """Print instructions for next steps"""
    print("\n" + "="*60)
    print("🎉 SETUP COMPLETE!")
    print("="*60)
    print("\nNext steps:")
    print("1. Edit .env file and add your Groq API key:")
    print("   GROQ_API_KEY=your_actual_api_key_here")
    print("\n2. Get a free Groq API key from:")
    print("   https://console.groq.com/")
    print("\n3. Run the application:")

    if os.name == 'nt':  # Windows
        print("   venv\\Scripts\\python main.py")
    else:  # macOS/Linux
        print("   venv/bin/python main.py")

    print("\n4. Open the web interface:")
    print("   http://127.0.0.1:8000")
    print("\n5. View API documentation:")
    print("   http://127.0.0.1:8000/docs")

    print("\n" + "="*60)

def main():
    """Main setup function"""
    print("🚀 AI Schedule Enforcer Setup")
    print("="*40)

    # Check Python version
    if not check_python_version():
        sys.exit(1)

    # Setup virtual environment
    if not setup_virtual_environment():
        sys.exit(1)

    # Install dependencies
    if not install_dependencies():
        sys.exit(1)

    # Setup environment file
    if not setup_environment_file():
        sys.exit(1)

    # Print next steps
    print_next_steps()

if __name__ == "__main__":
    main()
