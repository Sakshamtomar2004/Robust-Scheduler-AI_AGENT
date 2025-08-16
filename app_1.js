// AI Schedule Enforcer Application Logic

// Sample data and configuration
const sampleTasks = [
    {
        id: "task_1",
        task_name: "Wake up",
        start_time: "06:00",
        task_duration: 5,
        alert_gap: 30,
        verification_instructions: "Upload a selfie with your eyes open and face clearly visible",
        status: "pending",
        created_at: new Date().toISOString(),
        verifications: []
    },
    {
        id: "task_2", 
        task_name: "Morning workout",
        start_time: "07:00",
        task_duration: 45,
        alert_gap: 15,
        verification_instructions: "Upload a photo of yourself in workout clothes at your exercise location",
        status: "pending",
        created_at: new Date().toISOString(),
        verifications: []
    },
    {
        id: "task_3",
        task_name: "Read book",
        start_time: "20:00", 
        task_duration: 30,
        alert_gap: 10,
        verification_instructions: "Upload a photo of yourself holding the book you're reading",
        status: "pending",
        created_at: new Date().toISOString(),
        verifications: []
    }
];

const mockVerificationResponses = [
    {
        success: true,
        reasoning: "I can clearly see your face with eyes open as requested. Verification successful.",
        confidence: 0.95
    },
    {
        success: false, 
        reasoning: "I cannot clearly see your eyes in this photo. Please ensure your eyes are open and face is well-lit.",
        confidence: 0.3
    },
    {
        success: true,
        reasoning: "I can see you're holding a book as requested. The verification requirements are met.",
        confidence: 0.88
    },
    {
        success: false,
        reasoning: "I don't see any workout clothes or exercise equipment in this photo. Please take a photo in your workout attire.",
        confidence: 0.2
    }
];

const workflowSteps = [
    { id: "check_time", name: "Check Schedule", description: "Compare current time with scheduled task times", status: "active" },
    { id: "trigger_alarm", name: "Trigger Alarm", description: "Activate visual/audio alerts when task time arrives", status: "waiting" },
    { id: "wait_upload", name: "Wait for Photo", description: "Accept user photo upload for verification", status: "waiting" },
    { id: "groq_verify", name: "Groq Verification", description: "Send photo to Groq Vision API for analysis", status: "waiting" },
    { id: "complete_retry", name: "Complete/Retry", description: "Mark task complete or retry based on verification", status: "waiting" }
];

// Application state
let tasks = [];
let currentActiveTask = null;
let currentUploadedImage = null;
let verificationAttempts = 0;
let clockInterval = null;
let scheduleCheckInterval = null;

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Load tasks from localStorage or use sample data
    loadTasks();
    
    // Start time updates
    startClock();
    
    // Start schedule monitoring
    startScheduleMonitoring();
    
    // Render initial UI
    renderTasks();
    updateStatusDashboard();
    renderWorkflow();
    
    // Apply saved theme
    applySavedTheme();
    
    // Set up drag and drop handlers
    setupDragAndDrop();
}

// Time management
function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const dateString = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    document.getElementById('currentTime').textContent = timeString;
    document.getElementById('currentDate').textContent = dateString;
    
    updateCountdown();
}

function updateCountdown() {
    const nextTask = getNextTask();
    const nextTaskElement = document.getElementById('nextTask');
    const countdownElement = document.getElementById('countdown');
    
    if (nextTask) {
        nextTaskElement.textContent = `${nextTask.task_name} at ${nextTask.start_time}`;
        
        const now = new Date();
        const taskTime = new Date();
        const [hours, minutes] = nextTask.start_time.split(':');
        taskTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        
        // If task time is tomorrow
        if (taskTime < now) {
            taskTime.setDate(taskTime.getDate() + 1);
        }
        
        const timeDiff = taskTime - now;
        
        if (timeDiff > 0) {
            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
            
            countdownElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            countdownElement.textContent = "00:00:00";
        }
    } else {
        nextTaskElement.textContent = "No upcoming tasks";
        countdownElement.textContent = "--:--:--";
    }
}

// Schedule monitoring
function startScheduleMonitoring() {
    checkSchedule();
    scheduleCheckInterval = setInterval(checkSchedule, 1000);
}

function checkSchedule() {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Check for tasks that should be active
    tasks.forEach(task => {
        if (task.status === 'pending' && task.start_time === currentTime) {
            activateTask(task);
        }
    });
}

function activateTask(task) {
    task.status = 'active';
    currentActiveTask = task;
    
    updateWorkflowStep('trigger_alarm', 'processing');
    updateStatusDashboard();
    renderTasks();
    saveTasks();
    
    // Show alarm
    showAlarm(task);
}

function showAlarm(task) {
    const alarmOverlay = document.getElementById('alarmOverlay');
    const alarmTaskName = document.getElementById('alarmTaskName');
    const alarmInstructions = document.getElementById('alarmInstructions');
    
    alarmTaskName.textContent = `${task.task_name} - ${task.start_time}`;
    alarmInstructions.textContent = task.verification_instructions;
    
    alarmOverlay.classList.remove('hidden');
    
    // Play alarm sound simulation (visual feedback)
    document.body.style.animation = 'alarmFlash 1s infinite';
}

function hideAlarm() {
    const alarmOverlay = document.getElementById('alarmOverlay');
    alarmOverlay.classList.add('hidden');
    document.body.style.animation = '';
    
    updateWorkflowStep('trigger_alarm', 'waiting');
}

// Task management
function loadTasks() {
    const savedTasks = localStorage.getItem('scheduleTasks');
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
    } else {
        // Load sample tasks for demo
        tasks = [...sampleTasks];
        saveTasks();
    }
}

function saveTasks() {
    localStorage.setItem('scheduleTasks', JSON.stringify(tasks));
}

function getNextTask() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const upcomingTasks = tasks.filter(task => task.status === 'pending').map(task => {
        const [hours, minutes] = task.start_time.split(':');
        const taskTime = parseInt(hours) * 60 + parseInt(minutes);
        
        return {
            ...task,
            timeInMinutes: taskTime >= currentTime ? taskTime : taskTime + 24 * 60
        };
    });
    
    upcomingTasks.sort((a, b) => a.timeInMinutes - b.timeInMinutes);
    
    return upcomingTasks[0] || null;
}

function generateTaskId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// UI Management
function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';
    
    if (tasks.length === 0) {
        tasksList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--space-20);">No tasks scheduled. Add your first task to get started!</p>';
        return;
    }
    
    tasks.forEach(task => {
        const taskElement = createTaskElement(task);
        tasksList.appendChild(taskElement);
    });
}

function createTaskElement(task) {
    const taskDiv = document.createElement('div');
    taskDiv.className = `task-item ${task.status}`;
    
    const verifyButton = task.status === 'active' 
        ? `<button class="btn btn--primary btn--sm" onclick="handleVerifyClick('${task.id}')">Verify Now</button>`
        : task.status === 'pending'
        ? `<button class="btn btn--outline btn--sm" onclick="simulateActivateTask('${task.id}')">Simulate Activation</button>`
        : '';
    
    const removeButton = task.status === 'pending' 
        ? `<button class="btn btn--secondary btn--sm" onclick="handleRemoveTask('${task.id}')">Remove</button>`
        : '';
    
    taskDiv.innerHTML = `
        <div class="task-header">
            <h4 class="task-title">${task.task_name}</h4>
            <div class="task-time">${task.start_time}</div>
        </div>
        <div class="task-details">
            <div>Duration: ${task.task_duration} min</div>
            <div>Alert gap: ${task.alert_gap} min</div>
        </div>
        <div class="task-instructions">${task.verification_instructions}</div>
        <div class="task-actions">
            <span class="status status--${task.status}">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</span>
            ${verifyButton}
            ${removeButton}
        </div>
    `;
    
    return taskDiv;
}

function updateStatusDashboard() {
    const activeTask = tasks.find(task => task.status === 'active');
    const activeTaskElement = document.getElementById('activeTask');
    const activeStatusElement = document.getElementById('activeStatus');
    
    if (activeTask) {
        activeTaskElement.textContent = activeTask.task_name;
        activeStatusElement.textContent = 'Active';
        activeStatusElement.className = 'status status--active';
    } else {
        activeTaskElement.textContent = 'None';
        activeStatusElement.textContent = 'Waiting';
        activeStatusElement.className = 'status status--info';
    }
    
    // Update completion stats
    const completedTasks = tasks.filter(task => task.status === 'completed').length;
    const failedTasks = tasks.filter(task => task.status === 'failed').length;
    
    document.getElementById('completedTasks').textContent = completedTasks;
    document.getElementById('failedTasks').textContent = failedTasks;
}

// Modal management
function openScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    modal.classList.remove('hidden');
}

function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    modal.classList.add('hidden');
    document.getElementById('scheduleForm').reset();
}

function openVerificationModal() {
    if (!currentActiveTask) {
        // If no active task, find any active task
        const activeTask = tasks.find(task => task.status === 'active');
        if (activeTask) {
            currentActiveTask = activeTask;
        } else {
            alert('No active task found. Please activate a task first.');
            return;
        }
    }
    
    const modal = document.getElementById('verificationModal');
    const instructionsText = document.getElementById('verificationInstructionsText');
    
    instructionsText.textContent = currentActiveTask.verification_instructions;
    modal.classList.remove('hidden');
    
    updateWorkflowStep('wait_upload', 'processing');
    hideAlarm();
}

function closeVerificationModal() {
    const modal = document.getElementById('verificationModal');
    modal.classList.add('hidden');
    resetUploadArea();
    
    if (currentActiveTask && currentActiveTask.status === 'active') {
        updateWorkflowStep('wait_upload', 'waiting');
        showAlarm(currentActiveTask);
    }
}

// Event handlers for task buttons
function handleVerifyClick(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        currentActiveTask = task;
        openVerificationModal();
    }
}

function handleRemoveTask(taskId) {
    if (confirm('Are you sure you want to remove this task?')) {
        removeTask(taskId);
    }
}

function simulateActivateTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status === 'pending') {
        activateTask(task);
    }
}

// Form handling
function addTask(event) {
    event.preventDefault();
    
    const taskName = document.getElementById('taskName').value.trim();
    const startTime = document.getElementById('startTime').value;
    const taskDuration = parseInt(document.getElementById('taskDuration').value);
    const alertGap = parseInt(document.getElementById('alertGap').value);
    const verificationInstructions = document.getElementById('verificationInstructions').value.trim();
    
    // Validation
    if (!taskName || !startTime || !taskDuration || !alertGap || !verificationInstructions) {
        alert('Please fill in all fields.');
        return;
    }
    
    if (taskDuration < 1 || taskDuration > 1440) {
        alert('Duration must be between 1 and 1440 minutes.');
        return;
    }
    
    if (alertGap < 1 || alertGap > 60) {
        alert('Alert gap must be between 1 and 60 minutes.');
        return;
    }
    
    const task = {
        id: generateTaskId(),
        task_name: taskName,
        start_time: startTime,
        task_duration: taskDuration,
        alert_gap: alertGap,
        verification_instructions: verificationInstructions,
        status: 'pending',
        created_at: new Date().toISOString(),
        verifications: []
    };
    
    tasks.push(task);
    saveTasks();
    renderTasks();
    updateStatusDashboard();
    closeScheduleModal();
    
    alert('Task added successfully!');
}

function removeTask(taskId) {
    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex > -1) {
        tasks.splice(taskIndex, 1);
        saveTasks();
        renderTasks();
        updateStatusDashboard();
    }
}

// File upload handling
function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);
    }
}

function triggerFileInput() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processImageFile(file);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processImageFile(files[0]);
    }
}

function processImageFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const uploadArea = document.getElementById('uploadArea');
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        const previewImage = document.getElementById('previewImage');
        const verifyButton = document.getElementById('verifyButton');
        
        placeholder.style.display = 'none';
        previewImage.src = e.target.result;
        previewImage.classList.remove('hidden');
        verifyButton.disabled = false;
        
        currentUploadedImage = e.target.result;
    };
    
    reader.readAsDataURL(file);
}

function resetUploadArea() {
    const uploadArea = document.getElementById('uploadArea');
    const placeholder = uploadArea.querySelector('.upload-placeholder');
    const previewImage = document.getElementById('previewImage');
    const verifyButton = document.getElementById('verifyButton');
    const resultDiv = document.getElementById('verificationResult');
    
    if (placeholder) placeholder.style.display = 'flex';
    if (previewImage) previewImage.classList.add('hidden');
    if (verifyButton) {
        verifyButton.disabled = true;
        verifyButton.textContent = 'Verify Photo';
    }
    if (resultDiv) resultDiv.classList.add('hidden');
    
    currentUploadedImage = null;
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
}

// Verification simulation
async function verifyPhoto() {
    if (!currentUploadedImage || !currentActiveTask) {
        alert('Please upload an image first.');
        return;
    }
    
    const verifyButton = document.getElementById('verifyButton');
    verifyButton.textContent = 'Verifying...';
    verifyButton.disabled = true;
    
    updateWorkflowStep('groq_verify', 'processing');
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get random mock response
    const mockResponse = mockVerificationResponses[Math.floor(Math.random() * mockVerificationResponses.length)];
    
    // Record verification attempt
    const verification = {
        timestamp: new Date().toISOString(),
        image_data: currentUploadedImage.substring(0, 100) + '...',
        result: mockResponse.success,
        reasoning: mockResponse.reasoning,
        confidence: mockResponse.confidence
    };
    
    currentActiveTask.verifications.push(verification);
    verificationAttempts++;
    
    // Display result
    displayVerificationResult(mockResponse);
    
    // Handle result
    if (mockResponse.success) {
        setTimeout(() => {
            completeTask(currentActiveTask);
            closeVerificationModal();
        }, 3000);
    } else {
        verifyButton.textContent = 'Retry Verification';
        verifyButton.disabled = false;
        updateWorkflowStep('groq_verify', 'waiting');
        
        // Show alarm again after delay
        setTimeout(() => {
            if (currentActiveTask && currentActiveTask.status === 'active') {
                showAlarm(currentActiveTask);
            }
        }, 5000);
    }
    
    saveTasks();
}

function displayVerificationResult(result) {
    const resultDiv = document.getElementById('verificationResult');
    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultReasoning = document.getElementById('resultReasoning');
    const resultConfidence = document.getElementById('resultConfidence');
    
    resultDiv.classList.remove('hidden', 'success', 'failure');
    
    if (result.success) {
        resultDiv.classList.add('success');
        resultIcon.textContent = '✅';
        resultTitle.textContent = 'Verification Successful';
    } else {
        resultDiv.classList.add('failure');
        resultIcon.textContent = '❌';
        resultTitle.textContent = 'Verification Failed';
    }
    
    resultReasoning.textContent = result.reasoning;
    resultConfidence.textContent = `${(result.confidence * 100).toFixed(0)}%`;
}

function completeTask(task) {
    task.status = 'completed';
    currentActiveTask = null;
    
    updateWorkflowStep('complete_retry', 'processing');
    setTimeout(() => {
        resetWorkflow();
    }, 1000);
    
    saveTasks();
    renderTasks();
    updateStatusDashboard();
}

// Workflow visualization
function renderWorkflow() {
    // Workflow is already rendered in HTML, just need to update status
    workflowSteps.forEach(step => {
        updateWorkflowStep(step.id, step.status);
    });
}

function updateWorkflowStep(stepId, status) {
    const stepElement = document.getElementById(`step-${stepId}`);
    if (!stepElement) return;
    
    const statusElement = stepElement.querySelector('.step-status');
    
    // Remove existing status classes
    stepElement.classList.remove('active', 'processing');
    
    // Add new status
    if (status === 'active' || status === 'processing') {
        stepElement.classList.add(status === 'active' ? 'active' : 'processing');
    }
    
    if (statusElement) {
        statusElement.textContent = status === 'processing' ? 'Processing' : 
                                   status === 'active' ? 'Active' : 'Waiting';
        statusElement.className = `step-status ${status}`;
    }
}

function resetWorkflow() {
    workflowSteps.forEach((step, index) => {
        const status = index === 0 ? 'active' : 'waiting';
        updateWorkflowStep(step.id, status);
    });
}

// Theme management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-color-scheme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-color-scheme', newTheme);
    localStorage.setItem('theme', newTheme);
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-color-scheme', savedTheme);
    }
}

// Utility functions
function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':');
    const hour12 = parseInt(hours) % 12 || 12;
    const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
}

function getCurrentTimeString() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// Cleanup
window.addEventListener('beforeunload', function() {
    if (clockInterval) clearInterval(clockInterval);
    if (scheduleCheckInterval) clearInterval(scheduleCheckInterval);
});

// Demo functions for testing
function simulateTaskActivation() {
    if (tasks.length > 0) {
        const pendingTasks = tasks.filter(task => task.status === 'pending');
        if (pendingTasks.length > 0) {
            activateTask(pendingTasks[0]);
        }
    }
}

// Add demo task for immediate testing
function addDemoTask() {
    const now = new Date();
    const futureTime = new Date(now.getTime() + 5000); // 5 seconds from now
    const timeString = `${futureTime.getHours().toString().padStart(2, '0')}:${futureTime.getMinutes().toString().padStart(2, '0')}`;
    
    const demoTask = {
        id: generateTaskId(),
        task_name: "Demo Task",
        start_time: timeString,
        task_duration: 5,
        alert_gap: 5,
        verification_instructions: "Upload any photo to test the verification system",
        status: "pending",
        created_at: new Date().toISOString(),
        verifications: []
    };
    
    tasks.push(demoTask);
    saveTasks();
    renderTasks();
    updateStatusDashboard();
}

// Expose functions for console testing
window.simulateTaskActivation = simulateTaskActivation;
window.addDemoTask = addDemoTask;