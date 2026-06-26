/**
 * Authentication and User Session management
 */

let registrationData = {};
let currentRegStep = 1;
let otpTimerInterval = null;

// --- TOGGLE VIEWS ---
window.toggleAuth = function(showRegister) {
    const loginForm = document.getElementById('loginForm');
    const registerWizard = document.getElementById('registerWizard');
    const forgotFlow = document.getElementById('forgotFlow');
    const authTitle = document.getElementById('authTitle');
    const authDesc = document.getElementById('authDesc');
    const toggleText = document.getElementById('toggleText');

    // Reset all
    loginForm.style.display = 'none';
    registerWizard.style.display = 'none';
    forgotFlow.style.display = 'none';
    toggleText.style.display = 'block';

    if (showRegister) {
        registerWizard.style.display = 'block';
        authTitle.innerText = 'Create Account';
        authDesc.innerText = 'Join the MeritOn platform to start your exams';
        toggleText.innerHTML = `Already have an account? <a href="javascript:void(0)" onclick="toggleAuth(false)" style="color: #60a5fa; font-weight: bold;">Login here</a>`;
        regStep(1);
    } else {
        loginForm.style.display = 'block';
        authTitle.innerText = 'Candidate Login';
        authDesc.innerText = 'Enter your credentials to continue';
        toggleText.innerHTML = `Don't have an account? <a href="javascript:void(0)" onclick="toggleAuth(true)" style="color: #60a5fa; font-weight: bold;">Register Now</a>`;
    }
};

window.showForgot = function() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerWizard').style.display = 'none';
    document.getElementById('forgotFlow').style.display = 'block';
    document.getElementById('toggleText').style.display = 'none';
    document.getElementById('authTitle').innerText = 'Reset Password';
    document.getElementById('authDesc').innerText = 'Recover your account access';
};

// --- LOGIN HANDLER ---
document.getElementById('loginForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    debugLog('INFO', 'AUTH', 'Login form submitted');
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    const identifier = document.getElementById('email').value.trim(); // Now Email or University ID
    const password = document.getElementById('password').value.trim();

    if (!identifier || !password) {
        alert('Please enter email/ID and password');
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
        
        let clientIP = 'Unknown';
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            clientIP = ipData.ip;
        } catch(e) {
            debugLog('WARN', 'AUTH', 'Failed to fetch client IP');
        }

        debugLog('API', 'AUTH', 'Attempting backend login');
        
        const response = await api.post({
            action: 'loginUser',
            email: identifier, // Use 'email' as payload key, backend handles identifier (Email or UnivID)
            password: password,
            ip: clientIP
        });

        if (response.success) {
            debugLog('STATE', 'AUTH', 'Login successful', response);
            
            // Normalize response data (handle both camelCase and PascalCase from backend)
            const sessionData = {
                userId: response.userId || response.UserID || response.userID || response.id,
                univId: response.univId || response.UnivID || response.universityId,
                fullName: response.fullName || response.FullName || response.name || response.Name,
                email: response.email || response.Email,
                role: response.role || response.Role || 'student',
                status: response.status || response.Status,
                college: response.college || response.College,
                lastLoginIP: response.lastLoginIP || response.IP,
                sessionToken: response.sessionToken || response.token || null,
                loginTime: new Date().getTime()
            };
            
            localStorage.setItem('cbt_user', JSON.stringify(sessionData));

            if (response.role === 'admin') {
                window.location.href = './admin-dashboard.html';
            } else {
                window.location.href = './test-lobby.html';
            }
        } else {
            debugLog('ERROR', 'AUTH', 'Login failed', response.error);
            alert(response.error || 'Login failed. Please check your credentials.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    } catch (err) {
        debugLog('ERROR', 'AUTH', 'Exception during login', err.message);
        alert('A connection error occurred. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

// --- REGISTRATION WIZARD LOGIC ---

function regStep(step) {
    currentRegStep = step;
    document.querySelectorAll('#registerWizard form').forEach(f => f.style.display = 'none');
    document.getElementById(`regStep${step}`).style.display = 'block';
    
    // Update Indicators
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`rs${i}`);
        el.className = 'auth-step ' + (i === step ? 'active' : (i < step ? 'completed' : ''));
    }
}

window.regPrev = function(step) {
    regStep(step);
};

document.getElementById('regStep1')?.addEventListener('submit', (e) => {
    e.preventDefault();
    registrationData.FullName = document.getElementById('regName').value.trim();
    registrationData.UnivID = document.getElementById('regUserId').value.trim();
    registrationData.Phone = document.getElementById('regPhone').value.trim();
    regStep(2);
});

document.getElementById('regStep2')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('regPassword').value;
    const conf = document.getElementById('regConfirmPassword').value;

    if (pass.length < 6) {
        await showWarning("Password must be at least 6 characters");
        return;
    }
    if (pass !== conf) {
        await showWarning("Passwords do not match");
        return;
    }

    registrationData.Email = document.getElementById('regEmail').value.trim();
    registrationData.Department = document.getElementById('regDept').value.trim();
    registrationData.Year = document.getElementById('regYear').value.trim();
    registrationData.Password = pass;

    // Send OTP
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending OTP...';
        
        const res = await api.post({ action: 'sendOTP', email: registrationData.Email, type: 'registration' });
        if (res.success) {
            regStep(3);
            startOtpTimer('regTimer', 'regResend');
            // Show inline OTP notice for registration
            showInlineOtpNotice('#regStep3', res.betaOtp || res.otp, res.betaMessage);
        } else {
            alert("Error: " + res.error);
        }
    } catch (err) {
        alert("Failed to send OTP.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

document.getElementById('regStep3')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (window.__registerInProgress) return;
    
    const otp = document.getElementById('regOtp').value.trim();
    if (!otp) {
        alert("Please enter the verification code.");
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        window.__registerInProgress = true;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizing...';

        const payload = {
            action: 'registerUser',
            userData: { ...registrationData, OTP: otp, Role: 'student' }
        };

        // Use noRetry option for registration to prevent automatic retries on validation errors
        const res = await api.post(payload, 0); 
        
        if (res.success) {
            alert("Registration successful! Welcome to MeritOn.");
            toggleAuth(false);
            // Clear registration data
            registrationData = {};
        } else {
            alert(res.error || "Registration failed.");
        }
    } catch (err) {
        alert("An error occurred during registration: " + err.message);
    } finally {
        window.__registerInProgress = false;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// --- FORGOT PASSWORD LOGIC ---

document.getElementById('forgotStep1')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('forgotId').value.trim();
    
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        
        const res = await api.post({ action: 'forgotPassword', identifier: id });
        if (res.success) {
            document.getElementById('forgotStep1').style.display = 'none';
            document.getElementById('forgotStep2').style.display = 'block';
            // Show inline OTP notice for forgot password
            showInlineOtpNotice('#forgotStep2', res.betaOtp || res.otp, res.betaMessage);
            alert("Reset OTP sent to your registered email.");
        } else {
            alert(res.error || "User not found.");
        }
    } catch (err) {
        alert("Failed to process request.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

document.getElementById('forgotStep2')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('forgotId').value.trim();
    const otp = document.getElementById('forgotOtp').value.trim();
    const pass = document.getElementById('newPassword').value;
    const conf = document.getElementById('confirmNewPassword').value;

    if (pass.length < 6) {
        await showWarning("Password too short");
        return;
    }
    if (pass !== conf) {
        await showWarning("Passwords do not match");
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
        
        const res = await api.post({ 
            action: 'resetPassword', 
            identifier: id, 
            otp: otp, 
            newPassword: pass 
        });

        if (res.success) {
            alert("Password reset successful! You can now login.");
            toggleAuth(false);
        } else {
            alert(res.error || "Reset failed.");
        }
    } catch (err) {
        alert("Failed to reset password.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// --- UTILS ---

function startOtpTimer(timerId, resendBtnId) {
    if (!timerId || !resendBtnId) return;
    
    let timeLeft = 120;
    const timerEl = document.getElementById(timerId);
    const resendBtn = document.getElementById(resendBtnId);
    
    if (!timerEl || !resendBtn) return;
    
    resendBtn.disabled = true;
    if (otpTimerInterval) clearInterval(otpTimerInterval);

    otpTimerInterval = setInterval(() => {
        timeLeft--;
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (timeLeft <= 0) {
            clearInterval(otpTimerInterval);
            resendBtn.disabled = false;
            timerEl.innerText = "00:00";
        }
    }, 1000);
}

window.resendOtp = async function(type) {
    const email = registrationData.Email || document.getElementById('forgotId').value;
    try {
        const res = await api.post({ action: 'sendOTP', email, type });
        if (res.success) {
            alert("A new code has been sent.");
            startOtpTimer(type === 'registration' ? 'regTimer' : '', type === 'registration' ? 'regResend' : '');
        }
    } catch (e) {}
};

function getUser() {
    const user = localStorage.getItem('cbt_user');
    return user ? JSON.parse(user) : null;
}

function checkAuth() {
    const user = getUser();
    const path = window.location.pathname;
    
    // Don't run checkAuth on landing pages or login pages
    const publicPages = ['index.html', 'login.html', 'admin.html', 'about.html', 'privacy.html', 'terms.html'];
    const isPublicPage = publicPages.some(p => path.endsWith(p)) || path === '/' || path === '';

    debugLog('STATE', 'AUTH', 'Checking Auth');

    if (!user && !isPublicPage) {
        debugLog('WARN', 'AUTH', 'Unauthorized access - redirecting to login');
        window.location.href = './index.html';
        return;
    }

    if (user && path.includes('admin') && user.role !== 'admin') {
        debugLog('ERROR', 'AUTH', 'Admin access denied for student');
        window.location.href = './index.html';
    }
}

async function logout() {
    if (window.__logoutInProgress) return;
    window.__logoutInProgress = true;

    const confirmed = await showConfirm('Are you sure you want to logout?', 'Confirm Logout');
    if (!confirmed) {
        window.__logoutInProgress = false;
        return;
    }

    debugLog('WARN', 'AUTH', 'User logging out');
    const user = JSON.parse(localStorage.getItem('cbt_user') || 'null');
    const isAdmin = user && user.role === 'admin';

    // Show appropriate exit loader
    if (isAdmin) {
        if (typeof showAdminExitLoader === 'function') showAdminExitLoader();
    } else {
        if (typeof showStudentExitLoader === 'function') showStudentExitLoader();
    }

    try {
        const logoutRequest = user?.sessionToken
            ? api.post({
                action: 'logoutSession',
                sessionToken: user.sessionToken
            })
            : Promise.resolve({ success: true });

        // Wait for logout or timeout (max 1.2s for responsiveness)
        const timeout = new Promise(resolve =>
            setTimeout(() => resolve({ timeout: true }), 1200)
        );

        await Promise.race([logoutRequest, timeout]);

    } catch (err) {
        console.warn('Backend logout failed or timed out:', err);
    } finally {
        // Clear all security contexts
        localStorage.removeItem('cbt_user');
        localStorage.removeItem('admin_token');
        sessionStorage.clear();

        // Final redirect
        setTimeout(() => {
            const redirectPath = isAdmin ? './admin.html' : './login.html';
            window.location.replace(redirectPath);
        }, 350);
    }
}

// OTP Inline Notice Helper Functions
function clearInlineOtpNotice() {
  const oldNotice = document.getElementById('inlineOtpNotice');
  if (oldNotice) oldNotice.remove();
}

function showInlineOtpNotice(targetSelector, otp, message) {
  clearInlineOtpNotice();

  if (!otp) return;

  const target = document.querySelector(targetSelector);
  if (!target) return;

  const notice = document.createElement('div');
  notice.id = 'inlineOtpNotice';
  notice.className = 'inline-otp-notice';

  const title = document.createElement('strong');
  title.textContent = 'Private Beta';

  const msg = document.createElement('div');
  msg.className = 'inline-otp-message';
  msg.textContent = message || 'Private beta: Email delivery is part of an upcoming update. This beta version allows you to get OTP directly here.';

  const codeWrap = document.createElement('div');
  codeWrap.className = 'inline-otp-code';
  codeWrap.appendChild(document.createTextNode('Your OTP: '));

  const code = document.createElement('code');
  code.textContent = String(otp);

  codeWrap.appendChild(code);

  notice.appendChild(title);
  notice.appendChild(msg);
  notice.appendChild(codeWrap);

  target.prepend(notice);
}

function applyGlobalTheme() {
    const savedTheme = localStorage.getItem('examTheme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
}

// Initializations
applyGlobalTheme();
if (typeof api !== 'undefined') checkAuth();
