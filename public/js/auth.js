// Authentication form handling
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupLink = document.getElementById('showSignup');
    const showLoginLink = document.getElementById('showLogin');
    const loginSection = document.getElementById('loginSection');
    const signupSection = document.getElementById('signupSection');

    // Toggle between login and signup forms
    if (showSignupLink) {
        showSignupLink.addEventListener('click', function(e) {
            e.preventDefault();
            if (loginSection) loginSection.style.display = 'none';
            if (signupSection) signupSection.style.display = 'block';
        });
    }

    if (showLoginLink) {
        showLoginLink.addEventListener('click', function(e) {
            e.preventDefault();
            if (signupSection) signupSection.style.display = 'none';
            if (loginSection) loginSection.style.display = 'block';
        });
    }

    // Login form submission
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const errorDiv = document.getElementById('loginError');
            const submitButton = loginForm.querySelector('button[type="submit"]');
            
            // Show loading state
            submitButton.disabled = true;
            submitButton.textContent = 'Signing in...';
            
            try {
                const result = await signIn(email, password);
                
                if (result.success) {
                    // Redirect will happen automatically via auth state change
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = result.error;
                        errorDiv.style.display = 'block';
                    }
                }
            } catch (error) {
                if (errorDiv) {
                    errorDiv.textContent = 'An unexpected error occurred';
                    errorDiv.style.display = 'block';
                }
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Sign In';
            }
        });
    }

    // Signup form submission
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const username = document.getElementById('username').value;
            const errorDiv = document.getElementById('signupError');
            const submitButton = signupForm.querySelector('button[type="submit"]');
            
            // Basic validation
            if (password !== confirmPassword) {
                if (errorDiv) {
                    errorDiv.textContent = 'Passwords do not match';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            if (password.length < 6) {
                if (errorDiv) {
                    errorDiv.textContent = 'Password must be at least 6 characters';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            // Show loading state
            submitButton.disabled = true;
            submitButton.textContent = 'Creating account...';
            
            try {
                const result = await signUp(email, password, username);
                
                if (result.success) {
                    alert('Account created! Please check your email for verification.');
                    // Switch to login form
                    if (signupSection) signupSection.style.display = 'none';
                    if (loginSection) loginSection.style.display = 'block';
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = result.error;
                        errorDiv.style.display = 'block';
                    }
                }
            } catch (error) {
                if (errorDiv) {
                    errorDiv.textContent = 'An unexpected error occurred';
                    errorDiv.style.display = 'block';
                }
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Create Account';
            }
        });
    }
});

// Protect pages that require authentication
function requireAuth() {
    if (!currentUser) {
        window.location.href = '/login/';
        return false;
    }
    return true;
}