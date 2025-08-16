// AI Schedule Enforcer Application with Enhanced Features
class ScheduleEnforcer {
    constructor() {
        this.API_BASE = 'http://localhost:8000';
        this.currentStream = null;
        this.capturedImageData = null;
        this.currentTaskForVerification = null;
        this.facingMode = 'user';
        this.apiAvailable = false;
        this.tasks = [];
        this.tasksLoaded = false;
        this.alarmActive = false;
        this.audioContext = null;
        this.alarmOscillator = null;
        this.warningAlerts = new Set();
        this.refreshInterval = null;
        this.warningCheckInterval = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.startClock();
        this.initializeAudioContext();
        
        // Initialize demo data first
        this.initializeDemoData();
        
        // Check API status and load tasks
        await this.checkAPIStatus();
        await this.loadTasks();
        this.updateDashboard();
        
        // Start monitoring systems
        this.startWarningSystem();
        this.startAutoRefresh();
    }

    // Audio Context Initialization
    initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    // Enhanced Clock with Task Monitoring
    startClock() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });
            document.getElementById('current-time').textContent = timeString;
            
            // Update task countdowns and check for alarms
            this.updateTaskCountdowns();
            this.checkForActiveAlarms();
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    // Warning System for Upcoming Tasks
    startWarningSystem() {
        this.warningCheckInterval = setInterval(() => {
            this.checkUpcomingTasks();
        }, 30000); // Check every 30 seconds
    }

    // Auto-refresh system
    startAutoRefresh() {
        this.refreshInterval = setInterval(async () => {
            if (document.visibilityState === 'visible') {
                await this.loadTasks();
                this.updateDashboard();
            }
        }, 10000); // Refresh every 10 seconds
    }

    // Check for upcoming tasks and show warnings
    checkUpcomingTasks() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        this.tasks.forEach(task => {
            if (task.status === 'pending') {
                const [hours, minutes] = task.start_time.split(':').map(Number);
                const taskTime = hours * 60 + minutes;
                const timeUntilTask = taskTime - currentTime;
                
                // Show warning 5 minutes before task
                if (timeUntilTask <= task.alert_gap && timeUntilTask > 0) {
                    const alertKey = `${task.id || task.task_name}_warning`;
                    if (!this.warningAlerts.has(alertKey)) {
                        this.showTaskWarning(task, timeUntilTask);
                        this.warningAlerts.add(alertKey);
                    }
                }
                
                // Remove expired warnings
                if (timeUntilTask <= 0) {
                    const alertKey = `${task.id || task.task_name}_warning`;
                    this.warningAlerts.delete(alertKey);
                }
            }
        });
    }

    // Show task warning banner
    showTaskWarning(task, minutesUntil) {
        const banner = document.getElementById('alert-banner');
        const message = document.getElementById('alert-message');
        
        message.textContent = `"${task.task_name}" starts in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}! Get ready to verify with a picture.`;
        banner.classList.remove('hidden');
        
        this.showToast(`⚠️ Task "${task.task_name}" starts in ${minutesUntil} minutes!`, 'warning');
        
        // Play notification sound
        this.playNotificationSound();
    }
    async startCamera() {
        // Stop any existing stream
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(t => t.stop());
        }
        const video = document.getElementById('camera-video');
        try {
            this.currentStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.facingMode }
            });
        } catch (err) {
            console.error('Error accessing camera:', err);
            this.showToast('Camera access denied or not available.', 'error');
            // Show file upload fallback
            document.querySelector('.file-upload-fallback').style.display = 'block';
            return;
        }
        video.srcObject = this.currentStream;
        // Wait for video metadata
        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });
    }

    // -------------------------------
    // 2) FIXED: Photo Capture Method
    // -------------------------------
    capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (!canvas.width || !canvas.height) {
    return this.showToast('Camera not ready, try again', 'error');
  }
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => {
    if (!blob) return this.showToast('Capture failed', 'error');
    this.capturedImageData = blob;
    // update preview and UI…
  }, 'image/jpeg', 0.9);
}

    }

    // -------------------------------
    // 3) FIXED: File Upload Fallback
    // -------------------------------
    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showToast('Select a valid image file.', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('File too large (max 10 MB).', 'error');
            return;
        }

        this.capturedImageData = file;

        // Show preview
        const preview = document.getElementById('captured-photo');
        const previewContainer = document.querySelector('.photo-preview');
        preview.src = URL.createObjectURL(file);
        previewContainer.classList.remove('hidden');

        // Hide camera video, show photo actions
        const video = document.getElementById('camera-video');
        if (video) video.style.display = 'none';
        document.querySelector('.camera-actions').classList.add('hidden');
        document.querySelector('.photo-actions').classList.remove('hidden');

        this.showToast('File selected! Review and upload.', 'success');
    }

    // Rest of your methods (uploadPhoto, retakePhoto, etc.) remain unchanged...
     uploadPhoto() {
        if (!this.capturedImageData || !this.currentTaskForVerification) {
            this.showToast('No photo or task selected.', 'error');
            return;
        }
        this.showLoadingOverlay();
        try {
            const formData = new FormData();
            formData.append('task_id', this.currentTaskForVerification.toString());
            formData.append('image', this.capturedImageData, 'photo.jpg');

            const response = await fetch(`${this.API_BASE}/verify`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || `HTTP ${response.status}`);
            }
            const result = await response.json();
            this.closeCameraModal();
            this.showVerificationResult(result);
            await this.loadTasks();
            this.updateDashboard();
            this.showToast(
                result.success ? 'Verification successful!' : 'Verification failed—try again.',
                result.success ? 'success' : 'warning'
            );
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    // retakePhoto() stays the same
    retakePhoto() {
        this.capturedImageData = null;
        const preview = document.querySelector('.photo-preview');
        preview.classList.add('hidden');
        const video = document.getElementById('camera-video');
        if (video && this.currentStream) {
            video.style.display = 'block';
            document.querySelector('.camera-actions').classList.remove('hidden');
        } else {
            // file upload fallback
            document.querySelector('.file-upload-fallback').style.display = 'block';
        }
        document.querySelector('.photo-actions').classList.add('hidden');
    }

    // ... rest of your existing methods ...


// Instantiate when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new ScheduleEnforcer();
});


    // ... rest of your existing methods ...


// Instantiate when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new ScheduleEnforcer();
});




    // Update task countdowns and visual indicators
    updateTaskCountdowns() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        document.querySelectorAll('.task-card').forEach(card => {
            const taskId = card.dataset.taskId;
            const task = this.tasks.find(t => (t.id || t.task_name) === taskId);
            
            if (task && task.status === 'pending') {
                const [hours, minutes] = task.start_time.split(':').map(Number);
                const taskTime = hours * 60 + minutes;
                const timeUntilTask = taskTime - currentTime;
                
                let countdownEl = card.querySelector('.task-card__countdown');
                if (!countdownEl) {
                    countdownEl = document.createElement('div');
                    countdownEl.className = 'task-card__countdown';
                    const timeEl = card.querySelector('.task-card__time');
                    if (timeEl) {
                        timeEl.parentNode.appendChild(countdownEl);
                    }
                }
                
                if (timeUntilTask > 0) {
                    const hours = Math.floor(timeUntilTask / 60);
                    const mins = timeUntilTask % 60;
                    countdownEl.innerHTML = `<i class="fas fa-hourglass-start"></i> Starts in ${hours}h ${mins}m`;
                    
                    // Add urgent styling if less than alert gap
                    if (timeUntilTask <= task.alert_gap) {
                        card.classList.add('urgent');
                    } else {
                        card.classList.remove('urgent');
                    }
                } else if (timeUntilTask <= 0 && timeUntilTask > -task.task_duration) {
                    // Task is active
                    countdownEl.innerHTML = `<i class="fas fa-play"></i> ACTIVE - Verify now!`;
                    card.classList.add('urgent');
                } else {
                    countdownEl.remove();
                    card.classList.remove('urgent');
                }
            }
        });
    }

    // Check for active tasks that need alarms
    checkForActiveAlarms() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        let hasActiveTask = false;
        
        this.tasks.forEach(task => {
            if (task.status === 'active' || task.status === 'pending') {
                const [hours, minutes] = task.start_time.split(':').map(Number);
                const taskTime = hours * 60 + minutes;
                const taskEndTime = taskTime + task.task_duration;
                
                // Check if task should be active
                if (currentTime >= taskTime && currentTime < taskEndTime) {
                    hasActiveTask = true;
                    // Update task status to active if it was pending
                    if (task.status === 'pending') {
                        task.status = 'active';
                        this.renderTasks(this.tasks);
                    }
                }
            }
        });
        
        // Start or stop alarm based on active tasks
        if (hasActiveTask && !this.alarmActive) {
            this.startAlarm();
        } else if (!hasActiveTask && this.alarmActive) {
            this.stopAlarm();
        }
        
        this.updateAlarmIndicator(hasActiveTask);
    }

    // Real alarm sound using Web Audio API
    startAlarm() {
        if (!this.audioContext || this.alarmActive) return;
        
        try {
            this.alarmActive = true;
            this.createAlarmSound();
            this.updateAlarmIndicator(true);
            this.showAlarmControls(true);
            this.showToast('🚨 TASK ACTIVE! Verification required!', 'error');
        } catch (error) {
            console.error('Failed to start alarm:', error);
        }
    }

    // Create alarm sound with Web Audio API
    createAlarmSound() {
        if (!this.audioContext) return;
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Create oscillator for alarm sound
        this.alarmOscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        this.alarmOscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Configure alarm sound (alternating frequencies)
        this.alarmOscillator.type = 'triangle';
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        
        // Start the alarm pattern
        this.startAlarmPattern();
    }

    // Alarm pattern: alternating frequencies
    startAlarmPattern() {
        if (!this.alarmOscillator || !this.alarmActive) return;
        
        const now = this.audioContext.currentTime;
        this.alarmOscillator.frequency.setValueAtTime(800, now);
        this.alarmOscillator.frequency.setValueAtTime(400, now + 0.5);
        
        this.alarmOscillator.start(now);
        
        // Continue pattern
        setTimeout(() => {
            if (this.alarmActive) {
                this.stopCurrentOscillator();
                this.createAlarmSound();
            }
        }, 1000);
    }

    // Stop current oscillator
    stopCurrentOscillator() {
        if (this.alarmOscillator) {
            try {
                this.alarmOscillator.stop();
                this.alarmOscillator.disconnect();
                this.alarmOscillator = null;
            } catch (error) {
                console.error('Error stopping oscillator:', error);
            }
        }
    }

    // Stop alarm
    stopAlarm() {
        this.alarmActive = false;
        this.stopCurrentOscillator();
        this.updateAlarmIndicator(false);
        this.showAlarmControls(false);
    }

    // Play notification sound
    playNotificationSound() {
        if (!this.audioContext) return;
        
        try {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 0.5);
        } catch (error) {
            console.error('Failed to play notification:', error);
        }
    }

    // Update alarm indicator in header
    updateAlarmIndicator(isActive) {
        const indicator = document.getElementById('alarm-indicator');
        const status = document.getElementById('alarm-status');
        
        if (isActive) {
            indicator.classList.add('active');
            status.textContent = 'ALARM ACTIVE';
            status.style.color = 'var(--color-error)';
        } else {
            indicator.classList.remove('active');
            status.textContent = 'Silent';
            status.style.color = 'var(--color-text-secondary)';
        }
    }

    // Show/hide alarm controls
    showAlarmControls(show) {
        const stopButton = document.getElementById('stop-alarm');
        if (show) {
            stopButton.classList.remove('hidden');
        } else {
            stopButton.classList.add('hidden');
        }
    }

    // Initialize demo data
    initializeDemoData() {
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMinute = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;
        
        // Create a task that will be active in 1 minute for testing
        const futureTime = new Date(now.getTime() + 1 * 60 * 1000);
        const futureHour = futureTime.getHours().toString().padStart(2, '0');
        const futureMinute = futureTime.getMinutes().toString().padStart(2, '0');
        const futureTimeString = `${futureHour}:${futureMinute}`;
        
        // Create a task for 2 hours from now
        const laterTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const laterHour = laterTime.getHours().toString().padStart(2, '0');
        const laterMin = laterTime.getMinutes().toString().padStart(2, '0');
        const laterTimeString = `${laterHour}:${laterMin}`;
        
        this.tasks = [
            {
                id: '1',
                task_name: 'Morning Exercise',
                start_time: futureTimeString,
                task_duration: 30,
                alert_gap: 5,
                verification_instructions: 'Take a photo showing you in workout clothes or at the gym. Look for exercise equipment, athletic wear, or fitness activity in the image.',
                status: 'pending'
            },
            {
                id: '2',
                task_name: 'Study Session',
                start_time: laterTimeString,
                task_duration: 90,
                alert_gap: 10,
                verification_instructions: 'Take a photo of your study setup with books, notebooks, or computer visible. Should show an organized learning environment.',
                status: 'pending'
            },
            {
                id: '3',
                task_name: 'Team Meeting',
                start_time: '14:00',
                task_duration: 60,
                alert_gap: 5,
                verification_instructions: 'Take a photo showing you in a professional setting - could be at a desk with a laptop, in a meeting room, or video call setup.',
                status: 'completed'
            }
        ];
        
        console.log('Demo data initialized:', this.tasks);
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Task form submission
        const taskForm = document.getElementById('task-form');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleTaskSubmission();
            });
        }

        // Refresh tasks
        const refreshBtn = document.getElementById('refresh-tasks');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadTasks();
            });
        }

        // Stop alarm button
        const stopAlarmBtn = document.getElementById('stop-alarm');
        if (stopAlarmBtn) {
            stopAlarmBtn.addEventListener('click', () => {
                this.stopAlarm();
            });
        }

        // Dismiss alert banner
        const dismissAlert = document.getElementById('dismiss-alert');
        if (dismissAlert) {
            dismissAlert.addEventListener('click', () => {
                document.getElementById('alert-banner').classList.add('hidden');
            });
        }

        // Clear Groq response
        const clearGroq = document.getElementById('clear-groq');
        if (clearGroq) {
            clearGroq.addEventListener('click', () => {
                this.clearGroqResponse();
            });
        }

        // Camera modal controls
        const closeCameraBtn = document.getElementById('close-camera');
        if (closeCameraBtn) {
            closeCameraBtn.addEventListener('click', () => {
                this.closeCameraModal();
            });
        }

        const captureBtn = document.getElementById('capture-photo');
        if (captureBtn) {
            captureBtn.addEventListener('click', () => {
                this.capturePhoto();
            });
        }

        const retakeBtn = document.getElementById('retake-photo');
        if (retakeBtn) {
            retakeBtn.addEventListener('click', () => {
                this.retakePhoto();
            });
        }

        const uploadBtn = document.getElementById('upload-photo');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                this.uploadPhoto();
            });
        }

        const switchBtn = document.getElementById('switch-camera');
        if (switchBtn) {
            switchBtn.addEventListener('click', () => {
                this.switchCamera();
            });
        }

        // File upload fallback
        const fileUpload = document.getElementById('file-upload');
        if (fileUpload) {
            fileUpload.addEventListener('change', (e) => {
                this.handleFileUpload(e);
            });
        }

        // Verification modal
        const closeVerificationBtn = document.getElementById('close-verification');
        if (closeVerificationBtn) {
            closeVerificationBtn.addEventListener('click', () => {
                this.closeVerificationModal();
            });
        }

        // Close modals when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeAllModals();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
                if (this.alarmActive) {
                    this.stopAlarm();
                }
            }
        });

        // Enable audio context on user interaction
        document.addEventListener('click', () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }, { once: true });
    }

    // API Status Check
    async checkAPIStatus() {
        const statusElement = document.getElementById('api-status');
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(`${this.API_BASE}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                this.apiAvailable = true;
                statusElement.className = 'status status--success';
                statusElement.textContent = 'Connected';
                this.showToast('Connected to AI Backend', 'success');
            } else {
                throw new Error('API not responding');
            }
        } catch (error) {
            this.apiAvailable = false;
            statusElement.className = 'status status--warning';
            statusElement.textContent = 'Demo Mode';
            console.log('API not available, running in demo mode');
        }
    }

    // Enhanced task submission with better validation
    async handleTaskSubmission() {
        const form = document.getElementById('task-form');
        
        const taskData = {
            task_name: document.getElementById('task-name').value.trim(),
            start_time: document.getElementById('start-time').value,
            task_duration: parseInt(document.getElementById('task-duration').value),
            alert_gap: parseInt(document.getElementById('alert-gap').value),
            verification_instructions: document.getElementById('verification-instructions').value.trim()
        };

        console.log('Form submission data:', taskData);

        if (!this.validateTaskData(taskData)) {
            return;
        }

        this.showLoadingOverlay();

        try {
            if (this.apiAvailable) {
                const response = await fetch(`${this.API_BASE}/schedule`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(taskData)
                });

                if (response.ok) {
                    const result = await response.json();
                    this.showToast('Task added successfully!', 'success');
                } else {
                    const error = await response.json();
                    this.showToast(error.detail || 'Failed to add task', 'error');
                    return;
                }
            } else {
                // Demo mode
                const newTask = {
                    ...taskData,
                    id: Date.now().toString(),
                    status: 'pending'
                };
                this.tasks.push(newTask);
                this.showToast('Task added successfully! (Demo Mode)', 'success');
            }
            
            form.reset();
            await this.loadTasks();
            this.updateDashboard();
        } catch (error) {
            console.error('Task submission error:', error);
            this.showToast('Error adding task. Please try again.', 'error');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    // Enhanced validation
    validateTaskData(data) {
        if (!data.task_name || data.task_name.length < 1 || data.task_name.length > 100) {
            this.showToast('Task name must be between 1-100 characters', 'error');
            return false;
        }
        
        if (!data.start_time || !/^\d{2}:\d{2}$/.test(data.start_time)) {
            this.showToast('Please select a valid start time', 'error');
            return false;
        }
        
        if (!data.task_duration || isNaN(data.task_duration) || data.task_duration < 1 || data.task_duration > 1440) {
            this.showToast('Task duration must be between 1-1440 minutes', 'error');
            return false;
        }
        
        if (!data.alert_gap || isNaN(data.alert_gap) || data.alert_gap < 1 || data.alert_gap > 60) {
            this.showToast('Alert gap must be between 1-60 minutes', 'error');
            return false;
        }
        
        if (!data.verification_instructions || data.verification_instructions.length < 10 || data.verification_instructions.length > 500) {
            this.showToast('Verification instructions must be between 10-500 characters', 'error');
            return false;
        }
        
        return true;
    }

    // Enhanced task loading
    async loadTasks() {
        const container = document.getElementById('tasks-container');
        
        try {
            let tasks = [];
            
            if (this.apiAvailable) {
                const response = await fetch(`${this.API_BASE}/schedule`);
                if (response.ok) {
                    tasks = await response.json();
                } else {
                    throw new Error('Failed to load tasks from API');
                }
            } else {
                tasks = [...this.tasks];
            }
            
            console.log('Loading tasks:', tasks);
            this.tasks = tasks;
            this.tasksLoaded = true;
            this.renderTasks(tasks);
            this.updateDashboard(tasks);
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.apiAvailable = false;
            if (this.tasks.length === 0) {
                this.initializeDemoData();
            }
            this.tasksLoaded = true;
            this.renderTasks(this.tasks);
            this.updateDashboard(this.tasks);
        }
    }

    // Enhanced task rendering
    renderTasks(tasks) {
        const container = document.getElementById('tasks-container');
        
        if (!tasks || tasks.length === 0) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <i class="fas fa-tasks"></i>
                    <p>No tasks scheduled. Add your first task above!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tasks.map(task => this.createTaskCard(task)).join('');
        
        setTimeout(() => {
            this.setupTaskEventListeners();
            this.updateTaskCountdowns();
        }, 100);
    }

    // Enhanced task card creation
    createTaskCard(task) {
        const statusClass = `task-status--${task.status}`;
        const statusText = task.status.charAt(0).toUpperCase() + task.status.slice(1);
        
        return `
            <div class="task-card" data-task-id="${task.id || task.task_name}">
                <div class="task-status status ${statusClass}">${statusText}</div>
                <div class="task-card__header">
                    <div>
                        <h3 class="task-card__title">${this.escapeHtml(task.task_name)}</h3>
                        <div class="task-card__time">
                            <i class="fas fa-clock"></i>
                            ${task.start_time} - ${this.calculateEndTime(task.start_time, task.task_duration)}
                        </div>
                    </div>
                </div>
                <div class="task-card__body">
                    <div class="task-card__info">
                        <div class="task-info-item">
                            <i class="fas fa-hourglass-half"></i>
                            ${task.task_duration} min
                        </div>
                        <div class="task-info-item">
                            <i class="fas fa-bell"></i>
                            ${task.alert_gap} min alert
                        </div>
                    </div>
                    <div class="task-card__description">
                        ${this.escapeHtml(task.verification_instructions)}
                    </div>
                    <div class="task-card__actions">
                        ${task.status === 'active' || task.status === 'pending' ? `
                            <button class="btn btn--camera btn--sm verify-task" data-task="${this.escapeHtml(task.task_name)}" data-instructions="${this.escapeHtml(task.verification_instructions)}">
                                <i class="fas fa-camera"></i> ${task.status === 'active' ? 'Verify Now' : 'Verify'}
                            </button>
                        ` : ''}
                        <button class="btn btn--sm btn--danger delete-task" data-task-id="${task.id || task.task_name}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    calculateEndTime(startTime, duration) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + duration;
        const endHours = Math.floor(totalMinutes / 60) % 24;
        const endMinutes = totalMinutes % 60;
        return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
    }

    setupTaskEventListeners() {
        // Verify task buttons
        document.querySelectorAll('.verify-task').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const taskName = e.target.dataset.task;
                const instructions = e.target.dataset.instructions;
                this.openCameraModal(taskName, instructions);
            });
        });

        // Delete task buttons
        document.querySelectorAll('.delete-task').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const taskId = e.target.dataset.taskId;
                this.deleteTask(taskId);
            });
        });
    }

    // Enhanced delete with proper API call
    async deleteTask(taskId) {
        const task = this.tasks.find(t => (t.id || t.task_name) === taskId);
        if (!task) return;
        
        if (!confirm(`Are you sure you want to permanently delete "${task.task_name}"?`)) {
            return;
        }

        this.showLoadingOverlay();

        try {
            if (this.apiAvailable) {
                const response = await fetch(`${this.API_BASE}/schedule/${taskId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.showToast('Task permanently deleted from database!', 'success');
                } else {
                    const error = await response.json();
                    throw new Error(error.detail || 'Delete failed');
                }
            } else {
                this.deleteTaskLocally(taskId);
                this.showToast('Task deleted (Demo Mode)', 'success');
            }
            
            await this.loadTasks();
            this.updateDashboard();
        } catch (error) {
            console.error('Delete task error:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    deleteTaskLocally(taskId) {
        this.tasks = this.tasks.filter(task => (task.id || task.task_name) !== taskId);
    }

    updateDashboard(tasks = this.tasks) {
        const totalTasks = tasks.length;
        const activeTasks = tasks.filter(task => task.status === 'active').length;
        const completedTasks = tasks.filter(task => task.status === 'completed').length;
        const pendingTasks = tasks.filter(task => task.status === 'pending').length;

        const elements = {
            'total-tasks': totalTasks,
            'active-tasks': activeTasks,
            'completed-tasks': completedTasks,
            'pending-tasks': pendingTasks
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    // Enhanced camera functionality
    async openCameraModal(taskName, instructions) {
        this.currentTaskForVerification = { taskName, instructions };
        const modal = document.getElementById('camera-modal');
        modal.classList.remove('hidden');
        
        try {
            await this.initializeCamera();
            this.showToast('Camera ready! Take a verification photo.', 'info');
        } catch (error) {
            console.error('Camera error:', error);
            this.showToast('Camera not available. Use file upload below.', 'warning');
        }
    }

    async initializeCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            const video = document.getElementById('camera-video');
            video.srcObject = this.currentStream;
            
            document.getElementById('camera-buttons').classList.remove('hidden');
            document.getElementById('photo-actions').classList.add('hidden');
            document.getElementById('photo-preview').classList.add('hidden');
            video.style.display = 'block';
        } catch (error) {
            console.error('Error accessing camera:', error);
            throw error;
        }
    }

    capturePhoto() {
        const video = document.getElementById('camera-video');
        const canvas = document.getElementById('camera-canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        this.capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
        
        const preview = document.getElementById('photo-preview');
        const img = document.getElementById('captured-photo');
        img.src = this.capturedImageData;
        
        video.style.display = 'none';
        preview.classList.remove('hidden');
        document.getElementById('camera-buttons').classList.add('hidden');
        document.getElementById('photo-actions').classList.remove('hidden');
        
        this.showToast('Photo captured! Upload for AI verification.', 'success');
    }

    retakePhoto() {
        const video = document.getElementById('camera-video');
        const preview = document.getElementById('photo-preview');
        
        video.style.display = 'block';
        preview.classList.add('hidden');
        document.getElementById('camera-buttons').classList.remove('hidden');
        document.getElementById('photo-actions').classList.add('hidden');
        
        this.capturedImageData = null;
    }

    async switchCamera() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
        }
        
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        
        try {
            await this.initializeCamera();
            this.showToast(`Switched to ${this.facingMode === 'user' ? 'front' : 'back'} camera`, 'info');
        } catch (error) {
            this.showToast('Failed to switch camera', 'error');
            this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.capturedImageData = e.target.result;
            this.showToast('Image loaded successfully', 'success');
        };
        reader.readAsDataURL(file);
    }

    // Enhanced upload with real Groq integration
    async uploadPhoto() {
        if (!this.capturedImageData || !this.currentTaskForVerification) {
            this.showToast('No photo captured or selected', 'error');
            return;
        }

        this.showLoadingOverlay();
        this.closeCameraModal();

        try {
            let result;
            
            if (this.apiAvailable) {
                // Real API call to your FastAPI backend
                const response = await fetch(this.capturedImageData);
                const blob = await response.blob();
                
                const formData = new FormData();
                formData.append('file', blob, 'verification.jpg');
                formData.append('task_name', this.currentTaskForVerification.taskName);
                formData.append('verification_instructions', this.currentTaskForVerification.instructions);

                const verifyResponse = await fetch(`${this.API_BASE}/verify`, {
                    method: 'POST',
                    body: formData
                });

                if (verifyResponse.ok) {
                    result = await verifyResponse.json();
                } else {
                    const error = await verifyResponse.json();
                    throw new Error(error.detail || 'Verification failed');
                }
            } else {
                // Demo mode with simulated processing
                await new Promise(resolve => setTimeout(resolve, 3000));
                result = this.generateMockVerificationResult();
            }
            
            // Display Groq response in dedicated section
            this.displayGroqResponse(result);
            
            // Show verification results
            this.showVerificationResults(result);
            
            // Update task status and reload
            await this.loadTasks();
            this.updateDashboard();
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast(`Verification failed: ${error.message}`, 'error');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    // Display Groq response in dedicated section
    displayGroqResponse(result) {
        const section = document.getElementById('groq-section');
        const responseEl = document.getElementById('groq-response');
        
        const confidence = Math.round((result.confidence || 0) * 100);
        const confidenceClass = confidence >= 75 ? 'high' : confidence >= 50 ? 'medium' : 'low';
        
        responseEl.innerHTML = `
            <div class="groq-metadata">
                <div>
                    <strong>Task:</strong> ${this.escapeHtml(this.currentTaskForVerification.taskName)}
                </div>
                <div class="confidence-badge ${confidenceClass}">
                    <i class="fas fa-brain"></i>
                    ${confidence}% confidence
                </div>
            </div>
            <div class="groq-reasoning">
${result.reasoning || 'No detailed reasoning provided.'}
            </div>
        `;
        
        responseEl.className = `groq-response ${result.success ? 'success' : 'failure'}`;
        section.classList.remove('hidden');
        
        // Scroll to Groq section
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Clear Groq response section
    clearGroqResponse() {
        const section = document.getElementById('groq-section');
        section.classList.add('hidden');
    }

    // Generate mock verification for demo
    generateMockVerificationResult() {
        const isSuccess = Math.random() > 0.3;
        const confidenceScore = isSuccess ? 0.75 + Math.random() * 0.25 : 0.3 + Math.random() * 0.4;
        
        const mockResponses = {
            success: [
                "VERIFICATION SUCCESSFUL\n\nAnalysis: The image clearly demonstrates engagement with the requested task. I can observe the following key elements:\n\n• Proper setup and environment consistent with task requirements\n• Visual evidence of active participation\n• All specified verification criteria appear to be met\n\nThe photo quality is good and provides sufficient detail for accurate assessment. The context and content align well with the verification instructions provided.",
                "TASK COMPLETION VERIFIED\n\nDetailed Assessment:\n• Environmental setup matches expected requirements\n• Clear visual indicators of task engagement\n• Proper attention to verification guidelines\n• No inconsistencies detected\n\nConfidence Level: High - The image provides strong evidence of task completion with multiple supporting visual elements clearly visible."
            ],
            failure: [
                "VERIFICATION FAILED\n\nAnalysis Issues Identified:\n\n• Required elements for this task are not clearly visible\n• Image quality insufficient for proper verification\n• Context doesn't match the specified verification instructions\n• Missing key indicators that would confirm task completion\n\nRecommendation: Please retake the photo ensuring all required elements are clearly visible and properly lit. Focus on including the specific items mentioned in the verification instructions.",
                "INSUFFICIENT EVIDENCE\n\nVerification Problems:\n• Cannot identify sufficient proof of task engagement\n• Photo angle or lighting makes assessment difficult\n• Key verification criteria not met\n• Image content doesn't align with task requirements\n\nPlease capture a new photo that better demonstrates completion of the assigned task according to the provided guidelines."
            ]
        };
        
        const reasoningOptions = isSuccess ? mockResponses.success : mockResponses.failure;
        const reasoning = reasoningOptions[Math.floor(Math.random() * reasoningOptions.length)];
        
        return {
            success: isSuccess,
            reasoning: reasoning,
            confidence: confidenceScore,
            timestamp: new Date().toISOString()
        };
    }

    showVerificationResults(result) {
        const modal = document.getElementById('verification-modal');
        const container = document.getElementById('verification-results');
        
        const isSuccess = result.success;
        const confidence = Math.round((result.confidence || 0) * 100);
        
        container.innerHTML = `
            <div class="verification-result ${isSuccess ? 'success' : 'failure'}">
                <div class="verification-icon ${isSuccess ? 'success' : 'failure'}">
                    <i class="fas fa-${isSuccess ? 'check-circle' : 'times-circle'}"></i>
                </div>
                <h3>${isSuccess ? 'Verification Successful!' : 'Verification Failed'}</h3>
                <div class="verification-details">
                    <div class="confidence-score">
                        <i class="fas fa-chart-line"></i>
                        AI Confidence: ${confidence}%
                    </div>
                    <p><small>Verified: ${new Date(result.timestamp || Date.now()).toLocaleString()}</small></p>
                    ${!this.apiAvailable ? '<p><small><em>Demo Mode - Simulated AI Response</em></small></p>' : ''}
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        
        if (isSuccess) {
            this.showToast('✅ Task verified successfully!', 'success');
            // Update task status to completed
            if (!this.apiAvailable) {
                const task = this.tasks.find(t => t.task_name === this.currentTaskForVerification.taskName);
                if (task) task.status = 'completed';
            }
        } else {
            this.showToast('❌ Verification failed - check Groq analysis', 'error');
        }
    }

    // Modal Management
    closeCameraModal() {
        const modal = document.getElementById('camera-modal');
        modal.classList.add('hidden');
        
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
        
        this.capturedImageData = null;
        this.currentTaskForVerification = null;
        
        const fileInput = document.getElementById('file-upload');
        if (fileInput) fileInput.value = '';
    }

    closeVerificationModal() {
        const modal = document.getElementById('verification-modal');
        modal.classList.add('hidden');
    }

    closeAllModals() {
        this.closeCameraModal();
        this.closeVerificationModal();
    }

    // UI Helpers
    showLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('hidden');
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${icons[type]} toast-icon ${type}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 5000);
        
        // Remove on click
        toast.addEventListener('click', () => toast.remove());
    }

    // Cleanup on page unload
    cleanup() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        if (this.warningCheckInterval) clearInterval(this.warningCheckInterval);
        this.stopAlarm();
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Enhanced AI Schedule Enforcer...');
    const app = new ScheduleEnforcer();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});