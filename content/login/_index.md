+++
date = '2025-07-19T18:47:33-04:00'
draft = false
title = 'Login'
layout = 'auth'
+++

<div id="loginSection">
    <h2>Sign In</h2>
    <form id="loginForm">
        <div class="form-group">
            <label for="loginEmail">Email:</label>
            <input type="email" id="loginEmail" required>
        </div>
        <div class="form-group">
            <label for="loginPassword">Password:</label>
            <input type="password" id="loginPassword" required>
        </div>
        <div id="loginError" class="error-message" style="display: none;"></div>
        <button type="submit">Sign In</button>
    </form>
    <p><a href="#" id="showSignup">Don't have an account? Sign up</a></p>
</div>

<div id="signupSection" style="display: none;">
    <h2>Create Account</h2>
    <form id="signupForm">
        <div class="form-group">
            <label for="username">Your Name:</label>
            <input type="text" id="username" required placeholder="Enter your real name">
            <small style="color: var(--secondary); font-size: 0.85rem; margin-top: 0.25rem; display: block;">
                Please use your real name to help other players identify you
            </small>
        </div>
        <div class="form-group">
            <label for="signupEmail">Email:</label>
            <input type="email" id="signupEmail" required>
        </div>
        <div class="form-group">
            <label for="signupPassword">Password:</label>
            <input type="password" id="signupPassword" required>
        </div>
        <div class="form-group">
            <label for="confirmPassword">Confirm Password:</label>
            <input type="password" id="confirmPassword" required>
        </div>
        <div id="signupError" class="error-message" style="display: none;"></div>
        <button type="submit">Create Account</button>
    </form>
    <p><a href="#" id="showLogin">Already have an account? Sign in</a></p>
</div>
