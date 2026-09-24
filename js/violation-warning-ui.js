/**
 * Violation Warning UI Controller
 * Manages the violation warning overlay on the exam page.
 */
class ViolationWarningUI {
    constructor() {
        this.overlay = null;
        this.countdownInterval = null;
        this.secondsRemaining = 0;
        this.deviceType = ''; // 'desktop' or 'mobile'
        this._injectStyles();
    }

    /**
     * Injects CSS styles for the violation warning overlay if not already present.
     */
    _injectStyles() {
        // Check if styles are already injected
        if (document.getElementById('violation-warning-ui-styles')) return;

        const css = `
            .violation-warning-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: auto;
                display: none; /* Will be set to flex when showing */
                align-items: center;
                justify-content: center;
                z-index: 10000; /* Higher than the modal system */
                padding: 10px;
                box-sizing: border-box;
            }

            .violation-warning-box {
                background: rgba(255, 255, 255, 0.9);
                border: 2px solid var(--warning-color, #f59e0b);
                border-radius: 12px;
                padding: 20px;
                max-width: 80%;
                width: 500px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                text-align: center;
            }

            /* Dark mode adjustment */
            body.dark-mode .violation-warning-box {
                background: rgba(30, 41, 59, 0.9);
                border-color: var(--warning-color, #f59e0b);
                color: white;
            }

            .violation-warning-message {
                font-size: 1rem;
                margin-bottom: 10px;
                color: inherit;
                line-height: 1.5;
            }

            .violation-warning-countdown {
                font-weight: bold;
                color: var(--warning-color, #f59e0b);
                font-size: 1.2em;
            }

            .violation-optional-text {
                font-size: 0.875rem;
                color: #6b7280;
                margin-top: 10px;
                display: block;
            }

            /* Active violation state */
            .violation-active .violation-warning-box {
                background: rgba(255, 255, 255, 0.9);
                border-color: var(--danger-color, #ef4444);
            }

            body.dark-mode .violation-active .violation-warning-box {
                background: rgba(30, 41, 59, 0.9);
                border-color: var(--danger-color, #ef4444);
            }

            .violation-active .violation-warning-message,
            .violation-active .violation-optional-text {
                color: var(--danger-color, #ef4444);
            }

            body.dark-mode .violation-active .violation-warning-message,
            body.dark-mode .violation-active .violation-optional-text {
                color: #f87171;
            }

            /* Recovered state */
            .violation-recovered .violation-warning-box {
                background: rgba(255, 255, 255, 0.9);
                border-color: var(--success-color, #22c55e);
            }

            body.dark-mode .violation-recovered .violation-warning-box {
                background: rgba(30, 41, 59, 0.9);
                border-color: var(--success-color, #22c55e);
            }

            .violation-recovered .violation-warning-message,
            .violation-recovered .violation-optional-text {
                color: var(--success-color, #22c55e);
            }

            body.dark-mode .violation-recovered .violation-warning-message,
            body.dark-mode .violation-recovered .violation-optional-text {
                color: #86efac;
            }

            /* Responsive adjustments */
            @media (max-width: 768px) {
                .violation-warning-box {
                    width: 90%;
                    padding: 15px;
                }

                .violation-warning-message {
                    font-size: 0.9rem;
                }

                .violation-optional-text {
                    font-size: 0.8rem;
                }

                .violation-go-back-btn {
                    font-size: 0.9rem;
                    padding: 10px 16px;
                }
            }

            /* Go Back to Exam Button */
            .violation-go-back-btn {
                margin-top: 15px;
                padding: 12px 24px;
                background-color: #3b82f6;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
            }

            .violation-go-back-btn:hover {
                background-color: #2563eb;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
            }

            .violation-go-back-btn:active {
                background-color: #1d4ed8;
                transform: scale(0.98);
            }

            body.dark-mode .violation-go-back-btn {
                background-color: #3b82f6;
                box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
            }

            body.dark-mode .violation-go-back-btn:hover {
                background-color: #60a5fa;
                box-shadow: 0 4px 12px rgba(96, 165, 250, 0.3);
            }

            /* Active violation state - hide button */
            .violation-active .violation-go-back-btn {
                display: none;
            }

            /* Recovered state - hide button */
            .violation-recovered .violation-go-back-btn {
                display: none;
            }
        `;

        const style = document.createElement('style');
        style.id = 'violation-warning-ui-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * Creates the overlay element if it doesn't exist.
     */
    _createOverlay() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'violationWarningOverlay';
        this.overlay.className = 'violation-warning-overlay';
        this.overlay.innerHTML = `
            <div class="violation-warning-box">
                <div class="violation-warning-message">
                    Warning: Return to the exam window. A violation will be recorded in <span class="violation-warning-countdown">5</span> seconds.
                </div>
                <button class="violation-go-back-btn" onclick="typeof returnToExamFromWarning === 'function' && returnToExamFromWarning()">
                    Go Back to Exam
                </button>
            </div>
        `;
        document.body.appendChild(this.overlay);
    }

    /**
     * Shows the warning overlay with countdown.
     * Supports two signatures for backward compatibility:
     * 1. showWarning(countdownSeconds, deviceType) - original signature
     * 2. showWarning(message, count, type) - new signature from exam.js
     * @param {...*} args - Arguments depending on signature
     */
    showWarning(...args) {
        let message, countdownSeconds, type;

        // Determine which signature is being used
        if (args.length === 2 && typeof args[0] === 'number') {
            // Original signature: showWarning(countdownSeconds, deviceType)
            countdownSeconds = args[0];
            type = args[1];
            message = `Warning: Return to the exam window. A violation will be recorded in ${countdownSeconds} seconds.`;
        } else if (args.length === 3 && typeof args[0] === 'string') {
            // New signature: showWarning(message, count, type)
            message = args[0];
            countdownSeconds = args[1];
            type = args[2];
        } else {
            // Fallback to original signature interpretation
            countdownSeconds = args[0] || 5;
            type = args[1] || 'desktop';
            message = `Warning: Return to the exam window. A violation will be recorded in ${countdownSeconds} seconds.`;
        }

        this._createOverlay();
        this.deviceType = type || 'desktop';
        this.secondsRemaining = countdownSeconds;

        // Update the message and show countdown
        const messageEl = this.overlay.querySelector('.violation-warning-message');
        if (args.length === 3 && typeof args[0] === 'string') {
            // New signature - use provided message and add countdown
            messageEl.innerHTML = `<div>${message}</div><div class="violation-optional-text">Violation will be recorded in <span class="violation-warning-countdown">${this.secondsRemaining}</span> seconds.</div>`;
        } else {
            // Original signature - use generated message
            messageEl.innerHTML = `Warning: Return to the exam window. A violation will be recorded in <span class="violation-warning-countdown">${this.secondsRemaining}</span> seconds.`;
        }

        // Show the overlay
        this.overlay.style.display = 'flex';

        // Start countdown timer
        this._startCountdown();
    }

    /**
     * Updates the countdown display.
     * @param {number} secondsRemaining - Seconds left in the countdown
     */
    updateCountdown(secondsRemaining) {
        this.secondsRemaining = secondsRemaining;
        const countdownEl = this.overlay.querySelector('.violation-warning-countdown');
        if (countdownEl) {
            countdownEl.textContent = secondsRemaining;
        }
    }

    /**
     * Shows the active violation overlay.
     */
    showActiveViolation() {
        // Update the message to active violation
        const messageEl = this.overlay.querySelector('.violation-warning-message');
        messageEl.innerHTML = `
            <div>Violation detected. Go back to the test ASAP.</div>
            <div class="violation-optional-text">Your absence is now being recorded until you return to the exam.</div>
        `;
        // Add active class for styling
        this.overlay.classList.add('violation-active');
        // Remove countdown if present (though it should not be showing in active state)
        const countdownEl = this.overlay.querySelector('.violation-warning-countdown');
        if (countdownEl) {
            countdownEl.parentNode.removeChild(countdownEl);
        }
    }

    /**
     * Shows the recovered overlay temporarily.
     */
    showRecovered() {
        // Update the message to recovered
        const messageEl = this.overlay.querySelector('.violation-warning-message');
        messageEl.innerHTML = `
            <div>Returned to exam. Violation recorded.</div>
        `;
        // Add recovered class for styling
        this.overlay.classList.add('violation-recovered');
        // Remove optional text if present
        const optionalText = this.overlay.querySelector('.violation-optional-text');
        if (optionalText) {
            optionalText.remove();
        }
    }

    /**
     * Clears the overlay and resets state.
     */
    clear() {
        // Stop countdown timer
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        // Remove overlay
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        // Reset state
        this.secondsRemaining = 0;
        this.deviceType = '';
        // Remove any state classes
        if (this.overlay) {
            this.overlay.classList.remove('violation-active', 'violation-recovered');
        }
    }

    /**
     * Starts the countdown timer that updates every second.
     */
    _startCountdown() {
        // Clear any existing interval
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        // Update display immediately
        this.updateCountdown(this.secondsRemaining);

        // Set interval to update every second
        this.countdownInterval = setInterval(() => {
            this.secondsRemaining--;
            if (this.secondsRemaining <= 0) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                // Notify the state machine that countdown has ended
                // We'll dispatch a custom event or call a callback?
                // Instead, we'll let the state machine handle the timing by calling updateCountdown until 0.
                // The state machine should also be tracking time and know when to transition.
                // We'll just update the UI to 0 and let the state machine decide.
                this.updateCountdown(0);
            } else {
                this.updateCountdown(this.secondsRemaining);
            }
        }, 1000);
    }
}

// Create a singleton instance
const violationWarningUI = new ViolationWarningUI();

// Make it globally accessible for the state machine to use
window.violationWarningUI = violationWarningUI;