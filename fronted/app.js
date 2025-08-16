// AI Schedule Enforcer Application
class ScheduleEnforcer {
    constructor() {
        this.API_BASE = 'http://localhost:8000';
        this.currentStream = null;
        this.capturedImageData = null;
        this.currentTaskForVerification = null;
        this.facingMode = 'user';
        this.apiAvailable = false;
        this.tasks = []; // Local task storage for demo
        this.tasksLoaded = false;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.startClock();
        
        // Initialize demo data first
        this.initializeDemoData();
        
        // Check API status and load tasks
        await this.checkAPIStatus();
        await this.loadTasks();
        this.updateDashboard();
    }

    // Clock functionality
    startClock() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            document.getElementById('current-time').textContent = timeString;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    // Initialize demo data when API is not available
    initializeDemoData() {
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMinute = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;
        
        const futureTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const futureHour = futureTime.getHours().toString().padStart(2, '0');
        const futureMinute = futureTime.getMinutes().toString().padStart(2, '0');
        const futureTimeString = `${futureHour}:${futureMinute}`;
        
        this.tasks = [
            {
                id: '1',
                task_name: 'Morning Exercise',
                start_time: currentTime,
                task_duration: 30,
                alert_gap: 5,
                verification_instructions: 'Take a photo showing you in workout clothes or at the gym. Look for exercise equipment, athletic wear, or fitness activity in the image.',
                status: 'active'
            },
            {
                id: '2',
                task_name: 'Study Session',
                start_time: futureTimeString,
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
            }
        });

        // Form input debugging
        const formInputs = document.querySelectorAll('#task-form input, #task-form textarea');
        formInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                console.log(`Input ${e.target.name}: ${e.target.value}`);
            });
        });
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
            this.showToast('Running in demo mode - backend not available', 'warning');
        }
    }

    // Task Management
    async handleTaskSubmission() {
        const form = document.getElementById('task-form');
        
        // Get form values directly from the elements
        const taskName = document.getElementById('task-name').value.trim();
        const startTime = document.getElementById('start-time').value;
        const taskDuration = parseInt(document.getElementById('task-duration').value);
        const alertGap = parseInt(document.getElementById('alert-gap').value);
        const verificationInstructions = document.getElementById('verification-instructions').value.trim();
        
        const taskData = {
            task_name: taskName,
            start_time: startTime,
            task_duration: taskDuration,
            alert_gap: alertGap,
            verification_instructions: verificationInstructions
        };

        console.log('Form submission data:', taskData);

        // Validate form data
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
                // Demo mode - add task locally
                const newTask = {
                    ...taskData,
                    id: Date.now().toString(),
                    status: 'pending'
                };
                this.tasks.push(newTask);
                this.showToast('Task added successfully! (Demo Mode)', 'success');
            }
            
            // Clear form
            form.reset();
            
            // Reload tasks and update dashboard
            await this.loadTasks();
            this.updateDashboard();
        } catch (error) {
            console.error('Task submission error:', error);
            this.showToast('Error adding task. Please try again.', 'error');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    validateTaskData(data) {
        if (!data.task_name || data.task_name.length < 1 || data.task_name.length > 100) {
            this.showToast('Task name must be between 1-100 characters', 'error');
            return false;
        }
        
        if (!data.start_time) {
            this.showToast('Please select a start time', 'error');
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

    async loadTasks() {
        const container = document.getElementById('tasks-container');
        
        // Show loading state
        container.innerHTML = `
            <div class="loading-placeholder">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading tasks...</p>
            </div>
        `;

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
                // Demo mode - use local tasks with a small delay to simulate loading
                await new Promise(resolve => setTimeout(resolve, 800));
                tasks = [...this.tasks]; // Create a copy
            }
            
            console.log('Loading tasks:', tasks);
            this.tasksLoaded = true;
            this.renderTasks(tasks);
            this.updateDashboard(tasks);
        } catch (error) {
            console.error('Error loading tasks:', error);
            // Fallback to demo mode if API fails
            this.apiAvailable = false;
            if (this.tasks.length === 0) {
                this.initializeDemoData();
            }
            this.tasksLoaded = true;
            this.renderTasks(this.tasks);
            this.updateDashboard(this.tasks);
            this.showToast('Using demo data - backend not available', 'warning');
        }
    }

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
        
        // Add event listeners to task cards
        setTimeout(() => {
            this.setupTaskEventListeners();
        }, 100);
    }

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
                        ${task.status === 'active' ? `
                            <button class="btn btn--camera btn--sm verify-task" data-task="${this.escapeHtml(task.task_name)}" data-instructions="${this.escapeHtml(task.verification_instructions)}">
                                <i class="fas fa-camera"></i> Verify
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
                console.log('Opening camera for task:', taskName);
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

    async deleteTask(taskId) {
        if (!confirm('Are you sure you want to delete this task?')) {
            return;
        }

        this.showLoadingOverlay();

        try {
            if (this.apiAvailable) {
                const response = await fetch(`${this.API_BASE}/schedule/${taskId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.showToast('Task deleted successfully!', 'success');
                } else {
                    // Fallback to demo mode
                    this.apiAvailable = false;
                    this.deleteTaskLocally(taskId);
                    this.showToast('Task deleted (Demo Mode)', 'success');
                }
            } else {
                // Demo mode - delete locally
                this.deleteTaskLocally(taskId);
                this.showToast('Task deleted (Demo Mode)', 'success');
            }
            
            await this.loadTasks();
            this.updateDashboard();
        } catch (error) {
            console.error('Delete task error:', error);
            // Fallback to demo mode
            this.deleteTaskLocally(taskId);
            this.showToast('Task deleted (Demo Mode)', 'success');
            await this.loadTasks();
        } finally {
            this.hideLoadingOverlay();
        }
    }

    deleteTaskLocally(taskId) {
        this.tasks = this.tasks.filter(task => (task.id || task.task_name) !== taskId);
        console.log('Tasks after deletion:', this.tasks);
    }

    updateDashboard(tasks = this.tasks) {
        const totalTasks = tasks.length;
        const activeTasks = tasks.filter(task => task.status === 'active').length;
        const completedTasks = tasks.filter(task => task.status === 'completed').length;
        const pendingTasks = tasks.filter(task => task.status === 'pending').length;

        const totalEl = document.getElementById('total-tasks');
        const activeEl = document.getElementById('active-tasks');
        const completedEl = document.getElementById('completed-tasks');
        const pendingEl = document.getElementById('pending-tasks');

        if (totalEl) totalEl.textContent = totalTasks;
        if (activeEl) activeEl.textContent = activeTasks;
        if (completedEl) completedEl.textContent = completedTasks;
        if (pendingEl) pendingEl.textContent = pendingTasks;

        console.log('Dashboard updated:', { totalTasks, activeTasks, completedTasks, pendingTasks });
    }

    // Camera Functionality
    async openCameraModal(taskName, instructions) {
        this.currentTaskForVerification = { taskName, instructions };
        const modal = document.getElementById('camera-modal');
        modal.classList.remove('hidden');
        
        try {
            await this.initializeCamera();
            this.showToast('Camera initialized. Take a verification photo!', 'info');
        } catch (error) {
            console.error('Camera error:', error);
            this.showToast('Camera not available. Please use file upload below.', 'warning');
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
            
            // Reset camera UI
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
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        this.capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Show photo preview
        const preview = document.getElementById('photo-preview');
        const img = document.getElementById('captured-photo');
        img.src = this.capturedImageData;
        
        // Update UI
        video.style.display = 'none';
        preview.classList.remove('hidden');
        document.getElementById('camera-buttons').classList.add('hidden');
        document.getElementById('photo-actions').classList.remove('hidden');
        
        this.showToast('Photo captured! Upload to verify or retake.', 'success');
    }

    retakePhoto() {
        // Reset to camera view
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
            this.facingMode = this.facingMode === 'user' ? 'environment' : 'user'; // Revert
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

    async uploadPhoto() {
        if (!this.capturedImageData || !this.currentTaskForVerification) {
            this.showToast('No photo captured or selected', 'error');
            return;
        }

        this.showLoadingOverlay();
        this.closeCameraModal();

        try {
            if (this.apiAvailable) {
                // Convert base64 to blob
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
                    const result = await verifyResponse.json();
                    this.showVerificationResults(result);
                } else {
                    const error = await verifyResponse.json();
                    this.showToast(error.detail || 'Verification failed', 'error');
                    return;
                }
            } else {
                // Demo mode - simulate AI verification
                await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing
                const mockResult = this.generateMockVerificationResult();
                this.showVerificationResults(mockResult);
            }
            
            await this.loadTasks(); // Refresh tasks after verification
        } catch (error) {
            console.error('Upload error:', error);
            // Fallback to demo mode
            const mockResult = this.generateMockVerificationResult();
            this.showVerificationResults(mockResult);
            await this.loadTasks();
        } finally {
            this.hideLoadingOverlay();
        }
    }

    generateMockVerificationResult() {
        const isSuccess = Math.random() > 0.3; // 70% success rate for demo
        const confidenceScore = isSuccess ? 0.75 + Math.random() * 0.25 : 0.3 + Math.random() * 0.4;
        
        const mockResponses = {
            success: [
                "I can see clear evidence of the requested activity in the image. The setup and environment match the verification requirements well.",
                "The image shows proper engagement with the task. All verification criteria appear to be met based on the visual evidence.",
                "Great job! The photo clearly demonstrates completion of the assigned task with good attention to the verification instructions."
            ],
            failure: [
                "The image doesn't clearly show the required elements for this task. Please retake the photo with better focus on the verification requirements.",
                "I cannot identify sufficient evidence of task completion in this image. The verification criteria don't appear to be met.",
                "The photo is unclear or doesn't match the expected verification requirements. Please try again with a clearer image."
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
                    <p><strong>AI Analysis:</strong></p>
                    <p>${result.reasoning || 'No reasoning provided'}</p>
                    <div class="confidence-score">
                        <i class="fas fa-chart-line"></i>
                        Confidence: ${confidence}%
                    </div>
                    <p class="mt-8"><small>Verified on: ${new Date(result.timestamp || Date.now()).toLocaleString()}</small></p>
                    ${!this.apiAvailable ? '<p class="mt-8"><small><em>Demo Mode - Results are simulated</em></small></p>' : ''}
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        
        if (isSuccess) {
            this.showToast('Task verified successfully!', 'success');
            // Update task status to completed in demo mode
            if (!this.apiAvailable) {
                const task = this.tasks.find(t => t.task_name === this.currentTaskForVerification.taskName);
                if (task) {
                    task.status = 'completed';
                }
            }
        } else {
            this.showToast('Task verification failed - please try again', 'error');
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
        
        // Reset file input
        const fileInput = document.getElementById('file-upload');
        if (fileInput) {
            fileInput.value = '';
        }
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
        if (overlay) {
            overlay.classList.remove('hidden');
        }
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
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
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
        
        // Remove on click
        toast.addEventListener('click', () => {
            toast.remove();
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing ScheduleEnforcer...');
    new ScheduleEnforcer();
});