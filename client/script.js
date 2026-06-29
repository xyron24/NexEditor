/**
 * NexEditor Authentication Page Logic
 * Contains particle canvas rendering and interactive tab/form handling.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Particle Canvas Section ---
  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId = null;
    let resizeTimeout = null;

    // Set canvas dimensions
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    }

    // Initialize particles based on screen size
    function initParticles() {
      particles = [];
      const particleCount = Math.min(Math.floor((canvas.width * canvas.height) / 18000), 100);
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(canvas));
      }
    }

    // Particle definition
    class Particle {
      constructor(cvs) {
        this.canvas = cvs;
        this.ctx = cvs.getContext('2d');
        this.reset();
      }

      reset() {
        this.x = Math.random() * this.canvas.width;
        this.y = Math.random() * this.canvas.height;
        this.radius = Math.random() * 1.8 + 0.8; // 0.8px to 2.6px
        this.vx = (Math.random() - 0.5) * 0.35; // slow float
        this.vy = (Math.random() - 0.5) * 0.35;
        this.alpha = Math.random() * 0.4 + 0.1;
        this.fadeSpeed = 0.002 + Math.random() * 0.003;
        this.fadeDirection = Math.random() > 0.5 ? 1 : -1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        // Wrap around boundaries
        if (this.x < 0) this.x = this.canvas.width;
        if (this.x > this.canvas.width) this.x = 0;
        if (this.y < 0) this.y = this.canvas.height;
        if (this.y > this.canvas.height) this.y = 0;

        // Smooth alpha shimmer
        this.alpha += this.fadeSpeed * this.fadeDirection;
        if (this.alpha >= 0.5) {
          this.alpha = 0.5;
          this.fadeDirection = -1;
        } else if (this.alpha <= 0.08) {
          this.alpha = 0.08;
          this.fadeDirection = 1;
        }
      }

      draw() {
        this.ctx.beginPath();
        this.ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(250, 250, 250, ${this.alpha})`;
        this.ctx.fill();
      }
    }

    // Draw constellation links between close particles
    function drawLinks() {
      const maxDistance = 110;
      const particleLen = particles.length;
      for (let i = 0; i < particleLen; i++) {
        for (let j = i + 1; j < particleLen; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const force = (maxDistance - dist) / maxDistance;
            const alpha = force * 0.06 * Math.min(p1.alpha, p2.alpha);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(250, 250, 250, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
    }

    // Animation loop
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const particleLen = particles.length;
      for (let i = 0; i < particleLen; i++) {
        particles[i].update();
        particles[i].draw();
      }
      drawLinks();

      animationId = requestAnimationFrame(animate);
    }

    // Initialize & bind events
    resizeCanvas();
    animate();

    // Debounced resize to avoid memory leaks or layout thrashing
    window.addEventListener('resize', () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resizeCanvas();
      }, 150);
    });

    // Cleanup helper (if script reloads or views change)
    window.addEventListener('unload', () => {
      if (animationId) cancelAnimationFrame(animationId);
    });
  }

  // --- Interactive Tabs & Forms Section ---
  const tabButtons = document.querySelectorAll('.auth-tab-btn');
  const tabContents = document.querySelectorAll('.auth-tab-content');

  // Handle Tab Switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
      });

      btn.classList.add('active');
      const activeContent = document.getElementById(`tab-${targetTab}`);
      if (activeContent) {
        activeContent.classList.add('active');
        activeContent.style.display = 'block';
      }
    });
  });

  // Utility: Show input error outline
  function showError(input) {
    input.classList.add('input-error');
    input.focus();
    // Vibrate device if supported
    if (navigator.vibrate) navigator.vibrate(50);
  }

  // Clear input error on typing
  document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('input-error');
    });
  });

  // Dispatch auth-complete event to transition views
  function completeAuth(username) {
    if (username) {
      localStorage.setItem('nexeditor_username', username);
    } else {
      localStorage.removeItem('nexeditor_username');
    }
    
    // Hide auth screen
    const authPage = document.getElementById('auth-page');
    if (authPage) authPage.style.display = 'none';

    // Dispatch custom event for routing in UI handler
    window.dispatchEvent(new CustomEvent('auth-complete', {
      detail: { username: username || null }
    }));
  }

  // Sign In Form Submission
  const formSignIn = document.getElementById('form-signin');
  if (formSignIn) {
    formSignIn.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const emailInput = document.getElementById('signin-email');
      const passwordInput = document.getElementById('signin-password');
      
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();

      if (!email || !email.includes('@')) {
        showError(emailInput);
        return;
      }
      if (!password || password.length < 6) {
        showError(passwordInput);
        return;
      }

      const submitBtn = formSignIn.querySelector('.btn-continue');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          completeAuth(data.user.name);
        } else {
          alert(data.error || 'Login failed');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      })
      .catch(err => {
        console.error(err);
        alert('Network error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    });
  }

  // Create Account Form Submission
  const formSignUp = document.getElementById('form-signup');
  if (formSignUp) {
    formSignUp.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const nameInput = document.getElementById('signup-name');
      const emailInput = document.getElementById('signup-email');
      const passwordInput = document.getElementById('signup-password');
      
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();

      if (!name || name.length < 2) {
        showError(nameInput);
        return;
      }
      if (!email || !email.includes('@')) {
        showError(emailInput);
        return;
      }
      if (!password || password.length < 6) {
        showError(passwordInput);
        return;
      }

      const submitBtn = formSignUp.querySelector('.btn-continue');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Account...';

      fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          completeAuth(data.user.name);
        } else {
          alert(data.error || 'Signup failed');
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      })
      .catch(err => {
        console.error(err);
        alert('Network error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    });
  }

  // Google OAuth
  const googleBtn = document.getElementById('btn-oauth-google');

  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      googleBtn.disabled = true;
      googleBtn.textContent = 'Redirecting to Google...';
      window.location.href = '/api/auth/google';
    });
  }


  // Continue as Anonymous Guest
  const guestBtn = document.getElementById('btn-guest-access');
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      guestBtn.disabled = true;
      const originalText = guestBtn.textContent;
      guestBtn.textContent = 'Entering as Guest...';
      
      fetch('/api/auth/guest', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            completeAuth(data.user.name);
          } else {
            alert('Guest login failed');
            guestBtn.disabled = false;
            guestBtn.textContent = originalText;
          }
        })
        .catch(err => {
          console.error(err);
          guestBtn.disabled = false;
          guestBtn.textContent = originalText;
        });
    });
  }

  // Contact button placeholder handler
  const contactBtn = document.getElementById('btn-contact');
  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      alert('NexEditor Contact Support: support@nexeditor.dev');
    });
  }
});
