'use strict';

const connect = document.getElementById('connect');
const status = document.getElementById('status');
connect?.addEventListener('click', async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        status.textContent = 'Sign in to Hexa-Tech in the other tab, then select Continue here.';
        return;
    }
    connect.disabled = true;
    status.textContent = 'Checking your account…';
    try {
        const response = await fetch(connect.dataset.sessionUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
            },
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || body.error || 'Please sign in again to continue.');
        const target = new URL(body.redirect, window.location.origin);
        if (target.origin !== window.location.origin || target.pathname !== '/oauth/authorize') {
            throw new Error('Start the connection again from ChatGPT.');
        }
        window.location.assign(target.href);
    } catch (error) {
        status.textContent = error.message || 'Could not connect. Please try again.';
        connect.disabled = false;
    }
});
