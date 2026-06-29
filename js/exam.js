/**
 * =========================================================
 * MeritOn EXAM PANEL - ENTERPRISE STABILITY EDITION (v3.1)
 * =========================================================
 * Features:
 * ✔ Full Exam Recovery (Reload Safe)
 * ✔ Question & Option Shuffling (Per User)
 * ✔ Format Preservation (Exact Raw Text)
 * ✔ Safe Rendering (Displays tags as text)
 * ✔ Independent Scroll Zones
 * ✔ Sticky Footer Actions
 * ✔ Submission State Tracking & Retry
 * ✔ Mobile Optimized Action Bar
 * ✔ Live Exam Session Heartbeats
 * =========================================================
 */

let testData = null;
let rawQuestions = []; // Original order from backend
let displayQuestions = []; // Shuffled order for UI
let answers = {};
let currentIdx = 0;
let timeLeft = 0;
let timerInterval;

let reviewQuestions = new Set();
let visitedQuestions = new Set();

// Performance & Security Metrics
let startedAt = null;
let fullscreenViolations = 0;
let tabSwitchCount = 0;
let isSubmitting = false;
let submitClicked = false;
let submissionComplete = false;
let reenteringFullscreen = false;
let fullscreenWarningActive = false;
let lastFullscreenEnforceAt = 0;
let fullscreenReenterAttempts = 0;

// Violation state machine variables
let violationState = 'IDLE'; // IDLE, WARNING, ACTIVE_VIOLATION, RECOVERED
let violationStartTime = null;
let violationCountdownInterval = null;
let activeViolationStartTime = null;
let violationPending = null;

// Exam Violation Tracking (PATCHED v2)
let examViolations = {
    fullScreenViolations: 0,
    tabSwitchCount: 0,
    suspiciousScore: 0,
    autoSubmitted: false
};
let lastViolationRecordedAt = 0;

/* =========================================================
   FALLBACK VIOLATION WARNING FUNCTION (GUARANTEED VISIBLE)
========================================================= */

function showExamViolationWarning(message, count, type) {
    try {
        if (window.violationWarningUI && typeof window.violationWarningUI.showWarning === 'function') {
            // support both old signature and new signature safely
            window.violationWarningUI.showWarning(message, count, type);
            return;
        }
    } catch (e) {
        debugLog('WARN', 'VIOLATION_UI', 'Exception in violation warning UI', e.message);
    }

    let toast = document.getElementById('examViolationWarningToast');

    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'examViolationWarningToast';
        toast.style.cssText = `position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 999999; max-width: 92vw; padding: 14px 18px; border-radius: 14px; background: rgba(220, 38, 38, 0.96); color: #fff; font-weight: 700; box-shadow: 0 12px 35px rgba(0,0,0,.35); text-align: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; `;
        document.body.appendChild(toast);
    }

    toast.textContent = message || 'Warning: Exam violation detected';
    toast.style.display = 'block';
    toast.style.opacity = '1';

    clearTimeout(window.__examViolationToastTimer);
    window.__examViolationToastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 250);
    }, 4000);
}

/* =========================================================
   UNIFIED VIOLATION RECORDING FUNCTION
========================================================= */

function recordExamViolation(type, source) {
    // type: TAB_SWITCH or FULLSCREEN_EXIT
    // source: visibilitychange/pagehide/blur/fullscreen/manual-test
    
    if (!testData || submissionComplete || isSubmitting || submitClicked) {
        return;
    }

    // Dedupe same type within 1500ms
    const now = Date.now();
    const dedupeKey = `${type}_${Math.floor(now / 1500)}`;
    if (window.__lastViolationKey === dedupeKey) {
        return; // Duplicate within 1500ms window
    }
    window.__lastViolationKey = dedupeKey;

    // Increment appropriate counter
    if (type === 'TAB_SWITCH') {
        examViolations.tabSwitchCount++;
        showExamViolationWarning(`Warning: Tab switch detected (${examViolations.tabSwitchCount})`, examViolations.tabSwitchCount, type);
        debugLog('VIOLATION', 'TAB_SWITCH', `Count: ${examViolations.tabSwitchCount}, Source: ${source}`);
    } else if (type === 'FULLSCREEN_EXIT') {
        examViolations.fullScreenViolations++;
        showExamViolationWarning(`Warning: Fullscreen exited (${examViolations.fullScreenViolations})`, examViolations.fullScreenViolations, type);
        debugLog('VIOLATION', 'FULLSCREEN_EXIT', `Count: ${examViolations.fullScreenViolations}, Source: ${source}`);
    }

    // Calculate suspicious score
    examViolations.suspiciousScore = examViolations.fullScreenViolations + examViolations.tabSwitchCount;

    // Persist to sessionStorage scoped by TestId + userId
    const user = getUser();
    const userId = user?.userId || user?.userID || 'anon';
    const testId = testData?.TestID || 'unknown';
    const violationStorageKey = `meriton_exam_violations_${testId}_${userId}`;

    try {
        sessionStorage.setItem(violationStorageKey, JSON.stringify(examViolations));
        debugLog('INFO', 'VIOLATION_PERSIST', 'State saved to sessionStorage');
    } catch (e) {
        debugLog('WARN', 'VIOLATION_PERSIST', 'Failed to save to sessionStorage', e.message);
    }

    lastViolationRecordedAt = now;
}

/* =========================================================
   RESTORE VIOLATION STATE ON PAGE RELOAD
========================================================= */

function restoreViolationState() {
    const user = getUser();
    if (!user || !testData) return;

    const userId = user.userId || user.userID || 'anon';
    const testId = testData.TestID || 'unknown';
    const violationStorageKey = `meriton_exam_violations_${testId}_${userId}`;

    try {
        const saved = sessionStorage.getItem(violationStorageKey);
        if (saved) {
            const restored = JSON.parse(saved);
            examViolations = {
                fullScreenViolations: restored.fullScreenViolations || 0,
                tabSwitchCount: restored.tabSwitchCount || 0,
                suspiciousScore: restored.suspiciousScore || 0,
                autoSubmitted: restored.autoSubmitted || false
            };
            debugLog('INFO', 'VIOLATION_RESTORE', `Restored: FS=${examViolations.fullScreenViolations}, TS=${examViolations.tabSwitchCount}`);
        }
    } catch (e) {
        debugLog('WARN', 'VIOLATION_RESTORE', 'Failed to restore violation state', e.message);
    }
}

// Malpractice Detection Engine
class MalpracticeConfig {
    constructor() {
        // Detect mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                         window.innerWidth <= 768 ||
                         navigator.maxTouchPoints > 0;

        this.desktop = {
            warningMs: 5000,
            mergeWindowMs: 6000
        };
        this.mobile = {
            warningMs: 10000,
            mergeWindowMs: 10000
        };

        this.current = isMobile ? this.mobile : this.desktop;
        this.isMobile = isMobile;
    }

    getWarningMs() {
        return this.current.warningMs;
    }

    getMergeWindowMs() {
        return this.current.mergeWindowMs;
    }
}

class ExamEventManager {
    constructor() {
        this.events = [];
        this.listeners = {};
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Standard browser events for malpractice detection
        const events = [
            'visibilitychange',
            'blur',
            'focus',
            'pagehide',
            'pageshow',
            'fullscreenchange',
            'resize',
            'contextmenu',
            'keydown',
            'keyup'
        ];

        events.forEach(event => {
            document.addEventListener(event, (e) => this.handleEvent(event, e));
        });
    }

    handleEvent(eventType, event) {
        // Normalize event data
        const normalizedEvent = {
            type: eventType,
            timestamp: Date.now(),
            target: event.target ? event.target.tagName : 'unknown',
            // Prevent storing large objects
            metadata: this.extractEventMetadata(eventType, event)
        };

        this.events.push(normalizedEvent);
        this.triggerListeners(eventType, normalizedEvent);
    }

    extractEventMetadata(eventType, event) {
        const metadata = {};

        switch(eventType) {
            case 'visibilitychange':
                metadata.visibilityState = document.visibilityState;
                break;
            case 'fullscreenchange':
                metadata.fullscreenEnabled = !!document.fullscreenElement;
                break;
            case 'pagehide':
            case 'pageshow':
                metadata.persisted = event.persisted;
                break;
            case 'keydown':
            case 'keyup':
                metadata.key = event.key;
                metadata.code = event.code;
                metadata.ctrlKey = event.ctrlKey;
                metadata.shiftKey = event.shiftKey;
                metadata.altKey = event.altKey;
                metadata.metaKey = event.metaKey;
                break;
            case 'contextmenu':
                // Prevent storing coordinates that could be sensitive
                break;
            default:
                break;
        }

        return metadata;
    }

    on(eventType, callback) {
        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }
        this.listeners[eventType].push(callback);
    }

    triggerListeners(eventType, eventData) {
        if (this.listeners[eventType]) {
            this.listeners[eventType].forEach(callback => {
                try {
                    callback(eventData);
                } catch (err) {
                    console.error('Error in event listener:', err);
                }
            });
        }
    }

    getRecentEvents(sinceTimestamp) {
        return this.events.filter(e => e.timestamp >= sinceTimestamp);
    }

    clearEventsBefore(timestamp) {
        this.events = this.events.filter(e => e.timestamp >= timestamp);
    }
}

class ViolationStateMachine {
    constructor() {
        this.state = 'IDLE'; // IDLE, WARNING, ACTIVE_VIOLATION, RECOVERED
        this.warningTimer = null;
        this.warningStartTime = null;
        this.activeViolationStartTime = null;
        this.pendingViolation = null;
        this.deviceType = '';
        this.violationTypes = {
            TAB_SWITCH: 'TAB_SWITCH',
            FULLSCREEN_EXIT: 'FULLSCREEN_EXIT',
            WINDOW_BLUR: 'WINDOW_BLUR',
            PAGE_HIDE: 'PAGE_HIDE',
            BROWSER_RESIZE_SUSPICIOUS: 'BROWSER_RESIZE_SUSPICIOUS',
            FORBIDDEN_SHORTCUT: 'FORBIDDEN_SHORTCUT',
            CONTEXT_MENU: 'CONTEXT_MENU',
            COPY_PASTE_ATTEMPT: 'COPY_PASTE_ATTEMPT',
            DEVTOOLS_SHORTCUT_ATTEMPT: 'DEVTOOLS_SHORTCUT_ATTEMPT'
        };
    }

    transitionToWarning(eventData, config) {
        if (this.state !== 'IDLE') return false;

        this.state = 'WARNING';
        this.warningStartTime = Date.now();
        this.deviceType = this.detectDeviceType();
        this.pendingViolation = {
            startedAt: this.warningStartTime,
            type: this.classifyEvent(eventData),
            rawEvents: [eventData],
            metadata: {
                visibilityState: document.visibilityState,
                fullscreenActive: !!document.fullscreenElement,
                userAgent: navigator.userAgent.substring(0, 100), // Limit length
                screenSize: `${window.screen.width}x${window.screen.height}`
            }
        };

        // Start warning timer
        this.startWarningTimer(config.getWarningMs());

        return true;
    }

    transitionToIdle() {
        if (this.state === 'WARNING') {
            this.clearWarningTimer();
        }
        this.state = 'IDLE';
        this.pendingViolation = null;
        this.warningStartTime = null;
        this.deviceType = '';
    }

    transitionToActiveViolation() {
        if (this.state !== 'WARNING') return false;

        this.state = 'ACTIVE_VIOLATION';
        this.activeViolationStartTime = Date.now();
        this.clearWarningTimer();

        // The violation becomes active, but we don't finalize it yet
        // Wait for recovery to finalize
        return true;
    }

    transitionToRecovered() {
        if (this.state !== 'ACTIVE_VIOLATION') return false;

        this.state = 'RECOVERED';
        const endedAt = Date.now();
        const duration = endedAt - this.activeViolationStartTime;

        // Finalize the violation
        if (this.pendingViolation) {
            this.pendingViolation.endedAt = new Date(endedAt).toISOString();
            this.pendingViolation.duration = duration;
            this.pendingViolation.deviceType = this.deviceType;
            // Add question number if available
            try {
                const currentQElement = document.getElementById('currentQNum');
                if (currentQElement) {
                    this.pendingViolation.questionNumber = parseInt(currentQElement.textContent) || 0;
                }
            } catch (e) {
                // Ignore errors in getting question number
            }
        }

        return this.pendingViolation;
    }

    returnToIdle() {
        this.state = 'IDLE';
        this.pendingViolation = null;
        this.activeViolationStartTime = null;
        this.deviceType = '';
    }

    startWarningTimer(durationMs) {
        this.clearWarningTimer();
        this.warningTimer = setTimeout(() => {
            this.transitionToActiveViolation();
        }, durationMs);
    }

    clearWarningTimer() {
        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }
    }

    getState() {
        return this.state;
    }

    getPendingViolation() {
        return this.pendingViolation;
    }

    detectDeviceType() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768 ||
               navigator.maxTouchPoints > 0 ? 'mobile' : 'desktop';
    }

    classifyEvent(eventData) {
        const typeMap = {
            'visibilitychange': this.classifyVisibilityChange(eventData),
            'fullscreenchange': this.classifyFullscreenChange(eventData),
            'blur': this.classifyBlur(eventData),
            'pagehide': this.classifyPageHide(eventData),
            'pageshow': this.classifyPageShow(eventData),
            'keydown': this.classifyKeyDown(eventData),
            'keyup': this.classifyKeyUp(eventData),
            'contextmenu': this.classifyContextMenu(eventData),
            'resize': this.classifyResize(eventData)
        };

        return typeMap[eventData.type] || this.violationTypes.TAB_SWITCH; // Default
    }

    classifyVisibilityChange(eventData) {
        if (eventData.metadata.visibilityState === 'hidden') {
            return this.violationTypes.TAB_SWITCH; // Could also be window minimize
        }
        return null; // Not a violation when becoming visible
    }

    classifyFullscreenChange(eventData) {
        if (!eventData.metadata.fullscreenEnabled) {
            return this.violationTypes.FULLSCREEN_EXIT;
        }
        return null; // Not a violation when entering fullscreen
    }

    classifyBlur(eventData) {
        // Only consider it a violation if it's the window or document losing focus
        if (eventData.target === 'window' || eventData.target === 'document') {
            return this.violationTypes.WINDOW_BLUR;
        }
        return null;
    }

    classifyPageHide(eventData) {
        return this.violationTypes.PAGE_HIDE;
    }

    classifyPageShow(eventData) {
        return null; // Not a violation when page shows
    }

    classifyKeyDown(eventData) {
        // Check for forbidden shortcuts
        const forbiddenCombinations = [
            {key: 'F12', ctrl: false, shift: false},
            {key: 'I', ctrl: true, shift: true}, // Ctrl+Shift+I
            {key: 'J', ctrl: true, shift: true}, // Ctrl+Shift+J
            {key: 'C', ctrl: true, shift: true}, // Ctrl+Shift+C
            {key: 'U', ctrl: true},              // Ctrl+U
            {key: 'S', ctrl: true},              // Ctrl+S
            {key: 'P', ctrl: true},              // Ctrl+P
            {key: 'C', ctrl: true},              // Ctrl+C (will be checked elsewhere for context)
            {key: 'V', ctrl: true},              // Ctrl+V (will be checked elsewhere for context)
            {key: 'X', ctrl: true}               // Ctrl+X (will be checked elsewhere for context)
        ];

        const combo = forbiddenCombinations.find(c =>
            eventData.metadata.key.toUpperCase() === c.key &&
            (!c.ctrl || eventData.metadata.ctrlKey) &&
            (!c.shift || eventData.metadata.shiftKey)
        );

        if (combo) {
            return this.violationTypes.FORBIDDEN_SHORTCUT;
        }

        return null;
    }

    classifyKeyUp(eventData) {
        // Key up events are generally not violations by themselves
        return null;
    }

    classifyContextMenu(eventData) {
        return this.violationTypes.CONTEXT_MENU;
    }

    classifyResize(eventData) {
        // Check for suspicious resize (developer tools opening, etc.)
        // This is heuristic-based
        if (eventData.target === 'window') {
            // Could check for unusual dimensions that suggest devtools
            // For simplicity, we'll treat significant resizes as potentially suspicious
            return this.violationTypes.BROWSER_RESIZE_SUSPICIOUS;
        }
        return null;
    }
}

class WarningTimer {
    constructor(stateMachine, uiController) {
        this.stateMachine = stateMachine;
        this.uiController = uiController;
        this.interval = null;
        this.totalDuration = 0;
        this.remainingTime = 0;
    }

    start(durationMs, deviceType) {
        this.totalDuration = durationMs;
        this.remainingTime = durationMs;
        this.uiController.showWarning(Math.ceil(durationMs / 1000), deviceType);

        this.interval = setInterval(() => {
            this.remainingTime -= 1000;
            const secondsRemaining = Math.ceil(this.remainingTime / 1000);
            this.uiController.updateCountdown(secondsRemaining);

            if (this.remainingTime <= 0) {
                this.stop();
                this.stateMachine.transitionToActiveViolation();
            }
        }, 1000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    getRemainingTime() {
        return this.remainingTime;
    }
}

class ViolationMergeEngine {
    constructor(mergeWindowMs) {
        this.mergeWindowMs = mergeWindowMs;
        this.violationGroups = [];
    }

    addEventToViolation(eventData, stateMachine) {
        // If we don't have an active warning state, start one
        if (stateMachine.getState() !== 'WARNING') {
            return false;
        }

        const now = Date.now();

        // Find if this event belongs to an existing violation group
        let matchedGroup = null;
        for (const group of this.violationGroups) {
            if (now - group.firstEventTimestamp <= this.mergeWindowMs) {
                matchedGroup = group;
                break;
            }
        }

        if (!matchedGroup) {
            // Start a new violation group
            matchedGroup = {
                firstEventTimestamp: now,
                events: [],
                primaryType: null
            };
            this.violationGroups.push(matchedGroup);
        }

        // Add event to group
        matchedGroup.events.push(eventData);

        // Set primary type if not set (first event in group)
        if (!matchedGroup.primaryType) {
            matchedGroup.primaryType = stateMachine.classifyEvent(eventData);
        }

        // Clean up old groups
        this.violationGroups = this.violationGroups.filter(group =>
            now - group.firstEventTimestamp <= this.mergeWindowMs * 2 // Keep some buffer
        );

        return true;
    }

    getViolationGroups() {
        return this.violationGroups;
    }

    clearOldGroups(beforeTimestamp) {
        this.violationGroups = this.violationGroups.filter(group =>
            group.firstEventTimestamp >= beforeTimestamp
        );
    }
}

class ViolationDeduplicator {
    constructor() {
        this.processedViolationIds = new Set();
        this.violationIdCounter = 0;
    }

    generateViolationId() {
        this.violationIdCounter++;
        return `vio_${Date.now()}_${this.violationIdCounter}`;
    }

    isDuplicate(violation) {
        // Simple duplicate check based on time proximity and type
        // In a real implementation, this might be more sophisticated
        const violationKey = `${violation.type}_${violation.startedAt}`;
        if (this.processedViolationIds.has(violationKey)) {
            return true;
        }
        this.processedViolationIds.add(violationKey);

        // Clean old entries to prevent memory leak
        const now = Date.now();
        for (const key of this.processedViolationIds) {
            // Extract timestamp from key if possible
            const parts = key.split('_');
            if (parts.length >= 2) {
                const timestamp = parseInt(parts[1]);
                if (now - timestamp > 3600000) { // Older than 1 hour
                    this.processedViolationIds.delete(key);
                }
            }
        }

        return false;
    }

    deduplicateViolations(violations) {
        return violations.filter(v => !this.isDuplicate(v));
    }
}

class DurationTracker {
    constructor() {
        this.activeViolations = new Map(); // violationId -> startTime
    }

    startTracking(violationId) {
        this.activeViolations.set(violationId, Date.now());
    }

    stopTracking(violationId) {
        const startTime = this.activeViolations.get(violationId);
        if (startTime) {
            this.activeViolations.delete(violationId);
            return Date.now() - startTime;
        }
        return 0;
    }

    getDuration(violationId) {
        const startTime = this.activeViolations.get(violationId);
        if (startTime) {
            return Date.now() - startTime;
        }
        return 0;
    }
}

class ViolationLogger {
    constructor(stateMachine, mergeEngine, deduplicator, durationTracker) {
        this.stateMachine = stateMachine;
        this.mergeEngine = mergeEngine;
        this.deduplicator = deduplicator;
        this.durationTracker = durationTracker;
        this.violationQueue = [];
        this.isSending = false;
    }

    logViolationIfActive() {
        if (this.stateMachine.getState() === 'ACTIVE_VIOLATION') {
            const violation = this.stateMachine.getPendingViolation();
            if (violation) {
                // Add merged events and metadata
                const mergedEvents = this.mergeEngine.getViolationGroups()
                    .filter(group =>
                        group.firstEventTimestamp >= violation.startedAt &&
                        group.firstEventTimestamp <= new Date(violation.endedAt).getTime()
                    );

                if (mergedEvents.length > 0) {
                    // Use the first group's data (should be the main one)
                    const mainGroup = mergedEvents[0];
                    violation.metadata = violation.metadata || {};
                    violation.metadata.rawEvents = mainGroup.events.map(e => ({
                        type: e.type,
                        timestamp: e.timestamp,
                        target: e.target
                    }));
                    violation.metadata.mergedEventCount = mainGroup.events.length;
                    violation.metadata.primaryEvent = mainGroup.events[0]?.type || null;
                }

                // Generate violation ID
                violation.violationId = this.deduplicator.generateViolationId();

                // Add to queue for sending
                this.violationQueue.push(violation);

                // Try to send immediately
                this.sendQueuedViolations();
            }
        }
    }

    sendQueuedViolations() {
        if (this.isSending || this.violationQueue.length === 0) {
            return;
        }

        this.isSending = true;

        // Send all queued violations (in practice, you might want to batch or send one by one)
        const violationsToSend = [...this.violationQueue];
        this.violationQueue = [];

        // In a real implementation, you would send these via api.post
        // For now, we'll just log them and assume they're sent

        // Simulate sending - in reality, you'd wait for the response
        setTimeout(() => {
            this.isSending = false;
            // If there were failures, you might want to re-queue
        }, 1000);
    }

    getViolationQueue() {
        return [...this.violationQueue];
    }
}

class CandidateRestrictionManager {
    constructor() {
        this.setupRestrictions();
    }

    setupRestrictions() {
        // Disable context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // This could be logged as a violation candidate
        }, false);

        // Disable text selection in non-input areas
        document.addEventListener('selectstart', (e) => {
            if (!this.isAllowedTextInputTarget(e.target)) {
                e.preventDefault();
                // This could be logged as a violation candidate
                return false;
            }
        });

        // Disable certain keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Block F12
            if (e.key === 'F12') {
                e.preventDefault();
                return false;
            }

            // Block Ctrl+Shift+I, J, C (devtools)
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) {
                e.preventDefault();
                return false;
            }

            // Block Ctrl+U (view source)
            if (e.ctrlKey && e.key === 'U') {
                e.preventDefault();
                return false;
            }

            // Block Ctrl+S (save)
            if (e.ctrlKey && e.key === 'S') {
                e.preventDefault();
                return false;
            }

            // Block Ctrl+P (print)
            if (e.ctrlKey && e.key === 'P') {
                e.preventDefault();
                return false;
            }

            // Block Ctrl+C, Ctrl+V, Ctrl+X except in allowed text input areas
            if (e.ctrlKey && (e.key === 'C' || e.key === 'V' || e.key === 'X')) {
                if (!this.isAllowedTextInputTarget(e.target)) {
                    e.preventDefault();
                    return false;
                }
            }
        });

        // Disable certain mouse events if needed
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            return false;
        });
    }

    isAllowedTextInputTarget(target) {
        if (!target) return false;

        // Allow input, textarea, and contenteditable elements
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea') {
            // Check if it's not a button or other non-text input
            const type = target.type ? target.type.toLowerCase() : '';
            return !(type === 'button' || type === 'submit' || type === 'reset' ||
                    type === 'checkbox' || type === 'radio' || type === 'file');
        }
        if (tagName === 'div' && target.isContentEditable) {
            return true;
        }

        return false;
    }
}

// Global instances
const malpracticeConfig = new MalpracticeConfig();
const examEventManager = new ExamEventManager();
const violationStateMachine = new ViolationStateMachine();
const violationMergeEngine = new ViolationMergeEngine(malpracticeConfig.getMergeWindowMs());
const violationDeduplicator = new ViolationDeduplicator();
const durationTracker = new DurationTracker();
const violationLogger = new ViolationLogger(
    violationStateMachine,
    violationMergeEngine,
    violationDeduplicator,
    durationTracker
);
const candidateRestrictionManager = new CandidateRestrictionManager();

// PATCHED: Expose violation state machine globally for testing
window.violationStateMachine = violationStateMachine;

const FULLSCREEN_ENFORCE_COOLDOWN_MS = 5000;
const MAX_FULLSCREEN_REENTER_ATTEMPTS = 4;

// Live Exam Session
let liveExamSessionId = null;
let heartbeatInterval = null;

// Shuffling Maps
let questionOrder = []; // Array of indices
let optionShuffleMap = {}; // QID -> { A: "C", ... }

/* =========================================================
   GLOBAL MANUAL TEST HOOK (DEBUGGING ONLY)
========================================================= */

window.__meritonTestViolation = function(type) {
    const violationType = type || 'TAB_SWITCH';

    if (typeof recordExamViolation === 'function') {
        recordExamViolation(violationType, 'manual-test');
        return true;
    }

    if (window.violationStateMachine && typeof window.violationStateMachine.recordViolation === 'function') {
        window.violationStateMachine.recordViolation(violationType, 'manual-test');
        return true;
    }

    if (typeof startViolationCountdown === 'function') {
        if (violationType === 'FULLSCREEN_EXIT') {
            examViolations.fullScreenViolations = (examViolations.fullScreenViolations || 0) + 1;
        } else {
            examViolations.tabSwitchCount = (examViolations.tabSwitchCount || 0) + 1;
        }
        showExamViolationWarning('Manual test violation: ' + violationType, 1, violationType);
        startViolationCountdown();
        return true;
    }

    showExamViolationWarning('Manual test violation: ' + violationType, 1, violationType);
    return true;
};

/* =========================================================
   SAFE RENDERING & UTILS
========================================================= */

function escapeHTML(text) {
    if (!text) return '';
    const p = document.createElement('p');
    p.textContent = text;
    return p.innerHTML;
}

function isCodeContent(text) {
    if (!text) return false;
    const codePatterns = ['{', '}', 'function', 'var ', 'const ', 'let ', '=>', 'import ', '<div', '<img', 'JSON', 'XML'];
    return codePatterns.some(p => text.includes(p));
}

function formatContent(text) {
    const escaped = escapeHTML(text);
    const isCode = isCodeContent(text);
    return `<div class="question-text-area ${isCode ? 'code-mode' : ''}">${escaped}</div>`;
}

/* =========================================================
   MEDIA HELPER FUNCTIONS
========================================================= */

function getDefaultMediaObject() {
  return {
    type: 'none',
    url: '',
    publicId: '',
    alt: '',
    width: 0,
    height: 0,
    bytes: 0,
    format: '',
    provider: ''
  };
}

function hasMediaImage(media) {
  if (!media || typeof media !== 'object') {
    return false;
  }
  const url = media.url;
  if (!url || typeof url !== 'string') {
    return false;
  }
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return false;
  }
  // Reject dangerous schemes
  if (trimmedUrl.startsWith('data:image') || 
      trimmedUrl.startsWith('javascript:') || 
      trimmedUrl.startsWith('blob:')) {
    return false;
  }
  // Only allow http/https
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return false;
  }
  return true;
}

function getQuestionMedia(question) {
  if (!question || typeof question !== 'object') {
    return getDefaultMediaObject();
  }
  return question.questionMedia || question.question_media || getDefaultMediaObject();
}

function getOptionMedia(question, optionKey) {
  if (!question || typeof question !== 'object') {
    return getDefaultMediaObject();
  }
  const optionMedia = question.optionMedia || {};
  return optionMedia[optionKey] || getDefaultMediaObject();
}

function createMediaImageElement(media, className) {
  if (!hasMediaImage(media)) {
    return '';
  }
  
  const alt = media.alt || 'Image';
  const img = document.createElement('img');
  img.src = media.url;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerpolicy = 'no-referrer';
  img.draggable = false;
  img.oncontextmenu = function() { return false; };
  
  // Add exam-protected-media class along with any custom className
  const classes = ['exam-protected-media'];
  if (className) {
    classes.push(className);
  }
  img.className = classes.join(' ');
  
  // Add error handler
  img.onerror = function() {
    this.style.display = 'none';
    const fallback = document.createElement('div');
    fallback.className = 'media-fallback';
    fallback.textContent = 'Image failed to load';
    this.parentNode.insertBefore(fallback, this);
  };
  
  return img.outerHTML;
}

function getImageAspectClass(media) {
  if (!media || !media.width || !media.height || media.width === 0 || media.height === 0) {
    return 'aspect-unknown';
  }
  
  const aspectRatio = media.width / media.height;
  
  if (aspectRatio >= 2.0) {
    return 'aspect-ultrawide';
  } else if (aspectRatio >= 1.45) {
    return 'aspect-wide';
  } else if (aspectRatio >= 0.8) {
    return 'aspect-square';
  } else if (aspectRatio >= 0.45) {
    return 'aspect-portrait';
  } else {
    return 'aspect-tall';
  }
}

function getQuestionLayoutClass(question) {
  const media = getQuestionMedia(question);
  const hasQuestionImage = hasMediaImage(media);
  const hasQuestionText = question.Question && question.Question.trim();
  
  if (!hasQuestionImage) {
    return 'question-layout-text-only';
  }
  
  if (!hasQuestionText) {
    return 'question-layout-image-only';
  }
  
  // Text + image - determine layout based on aspect
  const aspectClass = getImageAspectClass(media);
  
  // On mobile, always stacked
  if (window.innerWidth <= 768) {
    return 'question-layout-stacked-mobile';
  }
  
  // On tablet (< 768px is mobile, so tablet is >= 768px)
  if (window.innerWidth < 1024) {
    // Tablet: square and portrait may split, wide/ultrawide/tall stack
    if (aspectClass === 'aspect-square' || aspectClass === 'aspect-portrait') {
      return 'question-layout-split-square';
    }
    return 'question-layout-stacked-wide';
  }
  
  // Desktop/laptop
  switch (aspectClass) {
    case 'aspect-ultrawide':
      return 'question-layout-stacked-ultrawide';
    case 'aspect-wide':
      return 'question-layout-stacked-wide';
    case 'aspect-square':
      return 'question-layout-split-square';
    case 'aspect-portrait':
      return 'question-layout-split-portrait';
    case 'aspect-tall':
      return 'question-layout-split-tall';
    default:
      return 'question-layout-stacked-wide';
  }
}

function questionHasAnyMedia(question) {
  return hasMediaImage(getQuestionMedia(question));
}

function optionHasAnyMedia(question, optionKey) {
  return hasMediaImage(getOptionMedia(question, optionKey));
}

function questionHasAnyOptionMedia(question) {
  if (!question || typeof question !== 'object') {
    return false;
  }
  const optionMedia = question.optionMedia || {};
  return ['A', 'B', 'C', 'D'].some(key => hasMediaImage(optionMedia[key]));
}

/**
 * Durstenfeld shuffle algorithm
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/* =========================================================
   RECOVERY & SHUFFLING ENGINE
========================================================= */

function getSessionKey() {
    const user = getUser();
    const testId = localStorage.getItem('selectedTestID');
    return `cbt_exam_session_${user?.userId || 'anon'}_${testId || 'none'}`;
}

function saveToSession() {
    if (isSubmitting || !testData) return;
    
    // Safety: Don't autosave a zero-time state if the exam hasn't even started.
    // This prevents mobile browsers from accidentally "finishing" an exam during page load/visibility changes.
    if (!startedAt && (timeLeft === 0 || timeLeft === null)) return;
    
    const state = {
        currentIdx,
        answers,
        reviewQuestions: Array.from(reviewQuestions),
        visitedQuestions: Array.from(visitedQuestions),
        questionOrder,
        optionShuffleMap,
        startedAt,
        timeLeft,
        liveExamSessionId,
        lastSavedAt: Date.now()
    };
    
    localStorage.setItem(getSessionKey(), JSON.stringify(state));
    debugLog('STATE', 'RECOVERY', 'Session autosaved');
}

function restoreFromSession() {
    const saved = localStorage.getItem(getSessionKey());
    if (!saved) return false;

    try {
        const state = JSON.parse(saved);
        // Verify session is for current test
        if (state.lastSavedAt && (Date.now() - state.lastSavedAt > 24 * 60 * 60 * 1000)) {
            debugLog('WARN', 'RECOVERY', 'Stale session found, ignoring');
            return false;
        }

        currentIdx = state.currentIdx || 0;
        reviewQuestions = new Set((state.reviewQuestions || []).map(qidKey));
        visitedQuestions = new Set((state.visitedQuestions || []).map(qidKey));
        questionOrder = state.questionOrder || [];
        optionShuffleMap = state.optionShuffleMap || {};
        answers = Object.fromEntries(
            Object.entries(state.answers || {}).map(([k, v]) => [qidKey(k), v])
        );
        startedAt = state.startedAt || null;
        timeLeft = state.timeLeft !== undefined ? state.timeLeft : timeLeft;
        liveExamSessionId = state.liveExamSessionId || null;

        // Validation: If session says 0 time left but never started, it's a corrupted/pre-start session
        if (timeLeft <= 0 && !startedAt) {
            debugLog('WARN', 'RECOVERY', 'Ignoring invalid session (0 time but not started)');
            return false;
        }
        
        debugLog('INFO', 'RECOVERY', 'Session restored successfully');
        return true;
    } catch (e) {
        debugLog('ERROR', 'RECOVERY', 'Failed to restore session', e);
        return false;
    }
}

/* =========================================================
   LIVE EXAM SESSION
========================================================= */

async function sendExamHeartbeat() {
    if (!liveExamSessionId || !testData || submissionComplete || isSubmitting) return;
    try {
        const payload = {
            action: 'examHeartbeat',
            TestId: String(testData.TestID),
            sessionId: liveExamSessionId,
            answeredCount: Object.keys(answers).length,
            currentQuestionIndex: currentIdx,
            FullScreenViolations: fullscreenViolations,
            TabSwitchCount: tabSwitchCount
        };

        if (violationPending) {
            payload.violationStartedAt = violationPending.startedAt;
            payload.violationEndedAt = violationPending.endedAt;
            payload.violationDuration = violationPending.duration;
            // Clear the pending violation after attaching to this heartbeat
            const temp = violationPending;
            violationPending = null;
        }

        await api.post(payload);
        debugLog('INFO', 'HEARTBEAT', 'Heartbeat sent');
    } catch (err) {
        debugLog('WARN', 'HEARTBEAT', 'Heartbeat failed', err.message);
    }
}

function startHeartbeatInterval() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(sendExamHeartbeat, 20000); // Every 20 seconds
    sendExamHeartbeat(); // Send immediately
}

/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    const urlParams = new URLSearchParams(window.location.search);
    let testId = urlParams.get('testId') || localStorage.getItem('selectedTestID');

    if (!testId) {
        window.location.href = './test-lobby.html';
        return;
    }

    localStorage.setItem('selectedTestID', testId);
    initExam(testId);
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('startBtn')?.addEventListener('click', startFullscreen);
    document.getElementById('prevBtn')?.addEventListener('click', () => navigate(-1));
    document.getElementById('nextBtn')?.addEventListener('click', () => navigate(1));
    document.getElementById('clearBtn')?.addEventListener('click', clearResponse);
    document.getElementById('markReviewBtn')?.addEventListener('click', toggleReview);
    document.getElementById('submitBtn')?.addEventListener('click', triggerSubmit);

    setupSecurityListeners();

    setStartButtonState(false);

    // Autosave triggers
    window.addEventListener('beforeunload', () => {
        saveToSession();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
    });
    window.addEventListener('blur', saveToSession);
    document.addEventListener('visibilitychange', saveToSession);
    setInterval(saveToSession, 15000); // Heartbeat save
}

function setStartButtonState(isReady) {
    const button = document.getElementById('startBtn');
    if (!button) return;

    if (isReady) {
        button.disabled = false;
        button.classList.remove('btn-loading');
        button.innerHTML = `
            <span>I am ready to begin</span>
            <i class="fas fa-arrow-right"></i>
        `;
    } else {
        button.disabled = true;
        button.classList.add('btn-loading');
        button.innerHTML = `
            <span>Wait, loading test...</span>
            <i class="fas fa-spinner fa-spin"></i>
        `;
    }
}


/** Normalize GET responses (array or { data } or { error }) */
function parseApiList(payload, label) {
    if (!payload) return [];
    if (payload.error) throw new Error(payload.error);
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    throw new Error(`Invalid ${label} response from server.`);
}

function qidKey(qid) {
    return String(qid);
}

function isAlreadySubmittedMessage(msg) {
    if (!msg) return false;
    const s = String(msg).toLowerCase();
    return (s.includes('already') && (s.includes('submit') || s.includes('submitted') || s.includes('attempt')))
        || s.includes('already submitted')
        || s.includes('exam already');
}

async function fetchExistingSubmission(testId, userId) {
    try {
        const perfRes = await api.get('getPerformance', { userID: userId });
        const list = parseApiList(perfRes, 'performance');
        return list.find(p => String(p.TestId || p.testId) === String(testId)) || null;
    } catch (e) {
        debugLog('WARN', 'EXAM', 'Could not verify prior submission', e.message);
        return null;
    }
}

async function redirectToResultForSubmission(record, testId) {
    submissionComplete = true;
    localStorage.removeItem(getSessionKey());
    localStorage.setItem('lastResult', JSON.stringify({
        ...(record || {}),
        TestId: String(testId),
        testId: String(testId)
    }));
    await exitExamFullscreen();
    window.location.href = `result.html?testId=${encodeURIComponent(testId)}`;
}

function requestExamFullscreen() {
    const elem = document.documentElement;
    const request = elem.requestFullscreen
        || elem.webkitRequestFullscreen
        || elem.mozRequestFullScreen
        || elem.msRequestFullscreen;
    if (!request) return Promise.reject(new Error('Fullscreen not supported'));
    try {
        const result = request.call(elem);
        return result && typeof result.then === 'function' ? result : Promise.resolve();
    } catch (e) {
        return Promise.reject(e);
    }
}

function exitExamFullscreen() {
    const exit = document.exitFullscreen
        || document.webkitExitFullscreen
        || document.mozCancelFullScreen
        || document.msExitFullscreen;
    if (!exit || !getActiveFullscreenElement()) return Promise.resolve();
    try {
        const result = exit.call(document);
        return result && typeof result.then === 'function' ? result : Promise.resolve();
    } catch (e) {
        return Promise.resolve();
    }
}

async function enforceExamFullscreen() {
    if (reenteringFullscreen || submissionComplete || isSubmitting || submitClicked || !startedAt) return;
    if (getActiveFullscreenElement()) {
        fullscreenReenterAttempts = 0;
        return;
    }
    const now = Date.now();
    if (now - lastFullscreenEnforceAt < FULLSCREEN_ENFORCE_COOLDOWN_MS) return;
    if (fullscreenReenterAttempts >= MAX_FULLSCREEN_REENTER_ATTEMPTS) return;

    reenteringFullscreen = true;
    lastFullscreenEnforceAt = now;
    fullscreenReenterAttempts += 1;
    try {
        await requestExamFullscreen();
        fullscreenReenterAttempts = 0;
    } catch (e) {
        debugLog('WARN', 'EXAM', 'Fullscreen re-entry declined', e.message);
    } finally {
        reenteringFullscreen = false;
    }
}

async function initExam(testId) {
    try {
        const testsRes = await api.get('getAllTests');
        const testList = parseApiList(testsRes, 'tests');
        testData = testList.find(t => String(t.TestID) === String(testId));

        if (!testData) throw new Error("Examination details not found.");

        const user = getUser();
        if (!user) {
            window.location.href = './index.html';
            return;
        }

        const userId = user.userId || user.userID;
        const existingSubmission = await fetchExistingSubmission(testId, userId);
        if (existingSubmission) {
            const viewResult = await showConfirm(
                'You have already submitted this examination. Would you like to view your results?',
                'Exam Already Submitted'
            );
            if (viewResult) {
                await redirectToResultForSubmission(existingSubmission, testId);
            } else {
                window.location.href = './test-lobby.html';
            }
            return;
        }

        const instName = document.getElementById('instTestName');
        const instDur = document.getElementById('instDuration');
        const testTitle = document.getElementById('testTitle');
        const candName = document.getElementById('candidateName');
        const candRoll = document.getElementById('candidateRoll');

        if (instName) instName.innerText = testData.Name;
        if (instDur) instDur.innerText = `${testData.Duration} mins`;
        if (testTitle) testTitle.innerText = testData.Name;
        if (candName) candName.innerText = user.fullName || user.name || 'Candidate';
        if (candRoll) candRoll.innerText = user.univId || user.UnivID || user.userId || 'N/A';

        const rawQsRes = await api.get('getQuestions', { testId });
        const rawQs = parseApiList(rawQsRes, 'questions');
        if (rawQs.length === 0) throw new Error("No questions found.");

        rawQuestions = rawQs.map(q => window.normalizePayload ? window.normalizePayload(q) : q);
        const instTotal = document.getElementById('instTotalQs');
        const totalQ = document.getElementById('totalQNum');

        if (instTotal) instTotal.innerText = `${rawQuestions.length} questions`;
        if (totalQ) totalQ.innerText = rawQuestions.length;

        const recovered = restoreFromSession();
        
        // PATCHED: Restore violation state from previous session if present
        restoreViolationState();
        
        if (!recovered) {
            // New Session: Generate Shuffling
            questionOrder = shuffleArray([...Array(rawQuestions.length).keys()]);
            rawQuestions.forEach(q => {
                const key = qidKey(q.QID);
                const labels = ['A', 'B', 'C', 'D'];
                const shuffledLabels = shuffleArray([...labels]);
                optionShuffleMap[key] = {};
                labels.forEach((l, i) => {
                    optionShuffleMap[key][l] = shuffledLabels[i];
                });
            });
            timeLeft = (testData.Duration || 60) * 60;
        }

        // Apply Shuffling to Display Array
        displayQuestions = questionOrder.map(i => {
            const q = rawQuestions[i];
            const sMap = optionShuffleMap[qidKey(q.QID)] || {};
            const mappedOptions = {};
            // Reconstruct options based on shuffle map
            // If mapping says A -> C, then displayQuestions[x].A will be rawQuestions[i].C
            ['A', 'B', 'C', 'D'].forEach(l => {
                const originalKey = sMap[l] || l;
                mappedOptions[l] = q[originalKey];
            });
            return { ...q, ...mappedOptions };
        });

        renderNavGrid();
        updateStats();
        setStartButtonState(true);

    } catch (err) {
        debugLog('ERROR', 'INIT', err.message);
        await showError(err.message, 'Unable to Start Exam');
        window.location.href = './test-lobby.html';
    }
}

/* =========================================================
   RENDERING & NAVIGATION
========================================================= */

function showQuestion(idx) {
    if (idx < 0 || idx >= displayQuestions.length) return;
    
    currentIdx = idx;
    const q = displayQuestions[idx];
    const qKey = qidKey(q.QID);
    visitedQuestions.add(qKey);

    const currentQ = document.getElementById('currentQNum');
    const sectionN = document.getElementById('sectionName');
    const qText = document.getElementById('questionText');
    const badge = document.getElementById('difficultyBadge');

    if (currentQ) currentQ.innerText = idx + 1;
    if (sectionN) sectionN.innerText = q.Section || 'General';
    
    // Render question with media support
    renderQuestionContent(q, qText);

    const diff = (q.Difficulty || 'Medium').toLowerCase();
    if (badge) {
        badge.innerText = q.Difficulty || 'Medium';
        badge.className = `diff-badge ${diff}`;
    }

    const optionsList = document.getElementById('optionsList');
    const currentAns = answers[qKey];

    // Render options with media support
    renderOptions(q, optionsList, currentAns, qKey);

    updatePalette();
    updateStats();
    saveToSession();
    sendExamHeartbeat(); // Send heartbeat when question changes
    
    document.getElementById('questionCard').scrollTop = 0;
}

function renderQuestionContent(question, container) {
    if (!container) return;
    
    const questionMedia = getQuestionMedia(question);
    const hasQuestionImage = hasMediaImage(questionMedia);
    const hasQuestionText = question.Question && question.Question.trim();
    
    // Determine layout class using new aspect-aware function
    const layoutClass = getQuestionLayoutClass(question);
    const aspectClass = getImageAspectClass(questionMedia);
    
    let html = `<div class="question-content-media ${layoutClass}">`;
    
    // Question text block
    if (hasQuestionText) {
        html += `<div class="question-text-block">${formatContent(question.Question)}</div>`;
    }
    
    // Question media block
    if (hasQuestionImage) {
        html += `<div class="question-media-block ${aspectClass}">`;
        html += createMediaImageElement(questionMedia, 'question-media-img');
        html += `</div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

function renderOptions(question, container, currentAns, qKey) {
    if (!container) return;
    
    const hasAnyOptionMedia = questionHasAnyOptionMedia(question);
    const containerClass = hasAnyOptionMedia ? 'options-media-grid' : 'options-container';
    container.className = containerClass;
    
    container.innerHTML = ['A', 'B', 'C', 'D'].map(label => {
        const optionMedia = getOptionMedia(question, label);
        const hasOptionImage = hasMediaImage(optionMedia);
        const optionText = question[label] || '';
        const hasOptionText = optionText.trim();
        
        let optionClass = 'option-card';
        if (hasOptionImage || hasOptionText) {
            if (hasOptionImage && !hasOptionText) {
                optionClass += ' option-image-only';
            } else if (!hasOptionImage && hasOptionText) {
                optionClass += ' option-text-only';
            } else {
                optionClass += ' option-text-image';
            }
        }
        
        if (hasAnyOptionMedia) {
            optionClass += ' option-card-media';
            // Add aspect class for option media
            if (hasOptionImage) {
                const optionAspectClass = getImageAspectClass(optionMedia);
                optionClass += ` option-media-${optionAspectClass.replace('aspect-', '')}`;
            }
        }
        
        if (currentAns === label) {
            optionClass += ' selected';
        }
        
        let html = `<div class="${optionClass}" onclick="selectOption('${qKey}', '${label}')">`;
        
        // Radio indicator / label
        html += `<div class="option-label-radio">
            <div class="opt-prefix">${label}</div>
        </div>`;
        
        // Content wrapper
        html += `<div class="option-content-wrap">`;
        
        // Option text
        if (hasOptionText) {
            html += `<div class="option-text-block">${escapeHTML(optionText)}</div>`;
        }
        
        // Option media
        if (hasOptionImage) {
            html += `<div class="option-media-block">`;
            html += createMediaImageElement(optionMedia, 'option-media-img');
            html += `</div>`;
        }
        
        html += `</div>`;
        html += `</div>`;
        
        return html;
    }).join('');
}

function selectOption(qid, label) {
    answers[qid] = label;
    showQuestion(currentIdx);
}

function clearResponse() {
    delete answers[qidKey(displayQuestions[currentIdx].QID)];
    showQuestion(currentIdx);
}

function toggleReview() {
    const qid = qidKey(displayQuestions[currentIdx].QID);
    if (reviewQuestions.has(qid)) reviewQuestions.delete(qid);
    else reviewQuestions.add(qid);
    showQuestion(currentIdx);
}

function navigate(dir) {
    const next = currentIdx + dir;
    if (next >= 0 && next < displayQuestions.length) showQuestion(next);
}

/* =========================================================
   SUBMISSION ENGINE
========================================================= */

async function triggerSubmit() {
    const count = Object.keys(answers).length;
    const confirmed = await showActionConfirm(
        `You have answered ${count} of ${displayQuestions.length} questions. Submit your exam now?`,
        'Submit Examination',
        'Submit'
    );
    if (confirmed) {
        submitClicked = true;
        submitExam();
    }
}

async function submitExam() {
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    clearInterval(timerInterval);

    // Send final heartbeat before submit
    await sendExamHeartbeat();

    // Merge current state with session to be 100% safe
    saveToSession();
    const finalState = JSON.parse(localStorage.getItem(getSessionKey()));
    const finalAnswers = finalState.answers || answers;

    // REMAP SHUFFLED ANSWERS TO ORIGINAL KEYS
    const remappedAnswers = {};
    for (const qid in finalAnswers) {
        const key = qidKey(qid);
        const displayedLabel = finalAnswers[qid];
        const map = optionShuffleMap[key];
        if (map && map[displayedLabel]) {
            remappedAnswers[key] = map[displayedLabel];
        } else {
            remappedAnswers[key] = displayedLabel;
        }
    }

    const user = getUser();
    if (!startedAt) {
        startedAt = new Date().toISOString();
    }

    const payload = {
        action: 'submitTest',
        userID: user.userId || user.userID,
        name: user.fullName || user.name,
        Email: user.email || user.Email,
        TestId: String(testData.TestID),
        answers: remappedAnswers,
        StartedAt: startedAt,
        
        // PATCHED: Include both nested and legacy violation fields for compatibility
        violations: {
            fullScreenViolations: examViolations.fullScreenViolations || 0,
            tabSwitchCount: examViolations.tabSwitchCount || 0,
            suspiciousScore: examViolations.suspiciousScore || 0,
            autoSubmitted: examViolations.autoSubmitted || (timeLeft <= 0)
        },
        
        // Legacy fields for backward compatibility
        FullScreenViolations: examViolations.fullScreenViolations || 0,
        TabSwitchCount: examViolations.tabSwitchCount || 0,
        fullScreenViolations: examViolations.fullScreenViolations || 0,
        tabSwitchCount: examViolations.tabSwitchCount || 0,
        suspiciousScore: examViolations.suspiciousScore || 0,
        autoSubmitted: examViolations.autoSubmitted || (timeLeft <= 0)
    };

    try {
        // Show MeritOn submission loader
        const submitLoader = document.getElementById('meritonSubmitLoader');
        if (submitLoader) {
            submitLoader.classList.add('active');
        }

        const res = await api.post(payload);
        if (res.success) {
            submissionComplete = true;
            localStorage.removeItem(getSessionKey());
            localStorage.setItem('lastResult', JSON.stringify({
                ...res,
                TestId: String(testData.TestID),
                testId: String(testData.TestID)
            }));
            await exitExamFullscreen();
            window.location.href = 'result.html';
        } else throw new Error(res.error);
    } catch (err) {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerText = 'Retry Submit';
        document.getElementById('submitOverlay')?.remove();

        const user = getUser();
        const existing = user
            ? await fetchExistingSubmission(testData.TestID, user.userId || user.userID)
            : null;

        if (existing || isAlreadySubmittedMessage(err.message)) {
            const viewResult = await showConfirm(
                'Your answers may already be saved on the server (for example after a network error). Would you like to view your results now?',
                'Already Submitted'
            );
            if (viewResult) {
                await redirectToResultForSubmission(existing || { TestId: testData.TestID }, testData.TestID);
                return;
            }
            submitClicked = false;
            return;
        }

        submitClicked = false;
        await showError('Submission Failed: ' + err.message, 'Submission Failed');
    }
}

/* =========================================================
   TIMER & SECURITY
========================================================= */

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    const timerDisplay = document.getElementById('timer');

    const update = () => {
        if (timeLeft <= 0) {
            // Safety: Only auto-submit if the exam has actually started
            if (startedAt) {
                clearInterval(timerInterval);
                submitClicked = true; // Mark as submitted to stop malpractice counting
                submitExam();
            } else {
                debugLog('WARN', 'TIMER', 'Timer hit zero but startedAt is missing. Skipping auto-submit.');
            }
            return;
        }
        timeLeft--;
        const h = Math.floor(timeLeft / 3600);
        const m = Math.floor((timeLeft % 3600) / 60);
        const s = timeLeft % 60;
        timerDisplay.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    update();
    timerInterval = setInterval(update, 1000);
}

async function startFullscreen() {
    try {
        await requestExamFullscreen();
        
        // Start Live Exam Session
        if (!liveExamSessionId) {
            const sessionRes = await api.post({
                action: 'startExamSession',
                TestId: String(testData.TestID)
            });
            if (sessionRes.success) {
                liveExamSessionId = sessionRes.sessionId;
                saveToSession();
                debugLog('INFO', 'LIVE_SESSION', 'Session started', sessionRes.sessionId);
            }
        }
        
        document.getElementById('fullscreenOverlay').style.display = 'none';
        document.getElementById('examContent').style.display = 'flex';
        if (!startedAt) startedAt = new Date().toISOString();
        startTimer();
        startHeartbeatInterval();
        showQuestion(currentIdx);
    } catch (err) {
        showWarning('Fullscreen is required to start the exam. Please allow fullscreen and try again.', 'Fullscreen Required');
    }
}

function getActiveFullscreenElement() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.msFullscreenElement
        || null;
}

function setupSecurityListeners() {
    // Visibility change (tab switch, window minimize)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !submissionComplete && !isSubmitting && !submitClicked) {
            // PATCHED: Also call recordExamViolation for unified tracking
            recordExamViolation('TAB_SWITCH', 'visibilitychange');
            
            // Only start violation countdown if we are in IDLE state
            if (violationState === 'IDLE') {
                startViolationCountdown();
            }
            saveToSession();
            sendExamHeartbeat();
        } else if (document.visibilityState === 'visible') {
            // Candidate returned to tab
            handleCandidateReturn();
        }
    });

    // Page hide/show for additional coverage (e.g., browser tab hidden via context menu)
    document.addEventListener('pagehide', () => {
        if (document.visibilityState === 'hidden' && !submissionComplete && !isSubmitting && !submitClicked) {
            // PATCHED: Also call recordExamViolation for unified tracking
            recordExamViolation('TAB_SWITCH', 'pagehide');
            
            if (violationState === 'IDLE') {
                startViolationCountdown();
            }
            saveToSession();
            sendExamHeartbeat();
        }
    });

    document.addEventListener('pageshow', () => {
        if (document.visibilityState === 'visible') {
            handleCandidateReturn();
        }
    });

    // Fullscreen change
    const handleFullscreenChange = () => {
        if (getActiveFullscreenElement()) {
            // We are in fullscreen
            if (violationState === 'WARNING' || violationState === 'ACTIVE_VIOLATION') {
                // Candidate returned to fullscreen during warning or active violation
                handleCandidateReturn();
            }
            return;
        }
        // We exited fullscreen
        if (!startedAt || submissionComplete || isSubmitting || submitClicked) return;
        if (violationState !== 'IDLE') return; // Already in violation state, do nothing to prevent duplicate

        // Only start violation countdown if we are in IDLE state
        if (violationState === 'IDLE') {
            // PATCHED: Also call recordExamViolation for unified tracking
            recordExamViolation('FULLSCREEN_EXIT', 'fullscreenchange');
            startViolationCountdown();
        }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
}

// Violation state machine helper functions

function getDeviceType() {
    return window.innerWidth <= 768 ? 'mobile' : 'desktop';
}

function startViolationCountdown() {
    // Only start if we are in IDLE state
    if (violationState !== 'IDLE') return;

    const deviceType = getDeviceType();
    const countdownSeconds = deviceType === 'mobile' ? 10 : 5;

    violationState = 'WARNING';
    violationStartTime = Date.now();
    
    // Safety check for violationWarningUI
    if (typeof window.violationWarningUI !== 'undefined' && window.violationWarningUI.showWarning) {
        window.violationWarningUI.showWarning(countdownSeconds, deviceType);
    }

    violationCountdownInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - violationStartTime) / 1000);
        const secondsRemaining = countdownSeconds - elapsed;
        if (secondsRemaining <= 0) {
            clearInterval(violationCountdownInterval);
            violationCountdownInterval = null;
            enterActiveViolation();
        } else {
            if (typeof window.violationWarningUI !== 'undefined' && window.violationWarningUI.updateCountdown) {
                window.violationWarningUI.updateCountdown(secondsRemaining);
            }
        }
    }, 1000);
}

function enterActiveViolation() {
    violationState = 'ACTIVE_VIOLATION';
    activeViolationStartTime = Date.now();
    violationWarningUI.showActiveViolation();
    // Note: we do not start a new interval; we wait for the candidate to return
}

function handleCandidateReturn() {
    if (violationState === 'WARNING') {
        clearInterval(violationCountdownInterval);
        violationCountdownInterval = null;
        violationWarningUI.clear();
        violationState = 'IDLE';
        // Do not record violation, do not increment counters
    } else if (violationState === 'ACTIVE_VIOLATION') {
        clearInterval(violationCountdownInterval);
        violationCountdownInterval = null;
        const endedAt = Date.now();
        const duration = endedAt - activeViolationStartTime;
        violationState = 'RECOVERED';
        violationWarningUI.showRecovered();
        violationPending = {
            startedAt: new Date(activeViolationStartTime).toISOString(),
            endedAt: new Date(endedAt).toISOString(),
            duration: duration
        };
        // Show recovered message for a short time, then clear and return to IDLE
        setTimeout(() => {
            violationWarningUI.clear();
            violationState = 'IDLE';
            violationPending = null; // Clear after sending in heartbeat
        }, 2000);
    }
    // If state is RECOVERED or IDLE, do nothing
}


/* =========================================================
   UI HELPERS
========================================================= */

function renderNavGrid() {
    const grid = document.getElementById('navGrid');
    grid.innerHTML = displayQuestions.map((q, i) => `
        <button class="q-btn" id="nav-${i}" onclick="showQuestion(${i})">${i + 1}</button>
    `).join('');
    updatePalette();
}

function updatePalette() {
    const btns = document.querySelectorAll('.q-btn');
    btns.forEach((btn, i) => {
        const qid = qidKey(displayQuestions[i].QID);
        btn.className = 'q-btn';
        if (i === currentIdx) btn.classList.add('current');
        else if (answers[qid]) btn.classList.add('answered');
        else if (reviewQuestions.has(qid)) btn.classList.add('review');
        else if (visitedQuestions.has(qid)) btn.classList.add('visited');
    });
}

function updateStats() {
    const answeredEl = document.getElementById('answeredCount');
    const reviewEl = document.getElementById('reviewCount');
    if (answeredEl) answeredEl.innerText = Object.keys(answers).length;
    if (reviewEl) reviewEl.innerText = reviewQuestions.size;
}

// Expose for inline handlers (nav grid, option cards)
window.showQuestion = showQuestion;
window.selectOption = selectOption;
