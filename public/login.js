// login.js
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent default form submission
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorPlaceholder = document.getElementById('login-error-placeholder');
    const submitButton = e.target.querySelector('button[type="submit"]');

    errorPlaceholder.innerHTML = ''; // Clear previous errors
    submitButton.disabled = true; // Disable button during request
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Logging in...'; // Show loading state

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.location.href = '/'; // Redirect to dashboard on success
        } else {
            // Display error message from server or a default one
            errorPlaceholder.innerHTML = `
                <div class="alert alert-danger alert-dismissible fade show" role="alert">
                   <i class="bi bi-exclamation-triangle-fill me-2"></i> ${result.message || 'Login failed. Please check your credentials.'}
                   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Login request failed:', error);
        errorPlaceholder.innerHTML = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
               <i class="bi bi-exclamation-triangle-fill me-2"></i> An network error occurred. Please try again.
               <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
    } finally {
        submitButton.disabled = false; // Re-enable button
        submitButton.innerHTML = 'Login'; // Restore button text
    }
});