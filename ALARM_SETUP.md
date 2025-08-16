# Alarm Sound Setup Guide

The AI Schedule Enforcer uses audio alarms to notify you when tasks are due for verification.

## Default Behavior (No Audio File)
Without an audio file, the system will:
- Print alarm messages to the console
- Show "🚨 ALARM ACTIVE" notifications
- Continue visual alerts until verification is completed

## Adding Custom Alarm Sound

### Option 1: Quick Setup
1. Download a WAV audio file (alarm, beep, or notification sound)
2. Name it `alarm.wav`
3. Place it in the same directory as `main.py`
4. Uncomment the playsound line in `main.py`:

```python
# In the AlarmSystem class, change this line:
# playsound("alarm.wav")  # Uncomment if you have an alarm sound file

# To this:
playsound("alarm.wav")
```

### Option 2: Custom Sound File
If you want to use a different filename:
1. Place your audio file in the project directory
2. Update the playsound call in `main.py`:
```python
playsound("your_sound_file.wav")
```

## Recommended Sound Sources
- **Freesound.org** - Free community sounds
- **Pixabay.com/audio** - Free sound effects
- **Zapsplat.com** - Professional sound library (free with registration)

## Audio Format Requirements
- **Best**: WAV format (universal compatibility)
- **Alternative**: MP3 format (may require additional libraries)
- **Duration**: 1-5 seconds recommended for alarm loops
- **Quality**: 44.1kHz, 16-bit recommended

## Testing Your Alarm
1. Add a test task scheduled for the current time + 1 minute
2. Wait for the alarm to trigger
3. Verify the sound plays correctly
4. Upload a verification photo to stop the alarm

## Troubleshooting
- **No sound on Linux**: Install additional audio libraries
  ```bash
  sudo apt-get install python3-pygame
  # or
  sudo apt-get install alsa-utils
  ```
- **No sound on macOS**: Ensure audio permissions are granted
- **No sound on Windows**: Try MP3 format if WAV doesn't work

## Alternative: Custom Notification System
You can also modify the alarm system to use:
- System notifications
- Desktop alerts  
- Email notifications
- SMS alerts (with additional services)

Edit the `AlarmSystem` class in `main.py` to customize notification behavior.
