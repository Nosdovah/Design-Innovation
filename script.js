document.addEventListener("DOMContentLoaded", () => {

    // ─── Number Counter Animation ────────────────────────────────────────
    const counters = document.querySelectorAll('.count');
    const speed = 100;

    counters.forEach(counter => {
        const target = +counter.getAttribute('data-target');
        const inc = target / speed;
        let count = 0;

        const updateCount = () => {
            count += inc;
            if (count < target) {
                counter.innerText = Math.ceil(count).toLocaleString();
                requestAnimationFrame(updateCount);
            } else {
                counter.innerText = target.toLocaleString() + "+";
            }
        };

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                updateCount();
                observer.disconnect();
            }
        }, { threshold: 0.5 });

        observer.observe(counter);
    });

    // ─── Smooth Scrolling ────────────────────────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
        });
    });

    // ─── Comment System ──────────────────────────────────────────────────
    const API = '/api/comments';

    /**
     * Render a single comment item into a <li>
     */
    function renderComment(c, cardId, section) {
        const li = document.createElement('li');
        li.className = 'comment-item';
        li.dataset.commentId = c.id;
        li.innerHTML = `
            <div class="comment-meta">
                <span class="comment-author">🖥️ ${escapeHtml(c.hostname)}</span>
                <span class="comment-ip">📡 ${escapeHtml(c.ip)}</span>
                <span class="comment-time">${escapeHtml(c.timestamp)}</span>
                <button class="comment-delete" title="Hapus Komentar">✕</button>
            </div>
            <p class="comment-text">${escapeHtml(c.text)}</p>
        `;

        // Wire up delete button
        li.querySelector('.comment-delete').addEventListener('click', () => {
            if (confirm('Hapus komentar ini?')) {
                deleteComment(section, cardId, c.id);
            }
        });

        return li;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Load and render all comments for a card
     */
    async function loadComments(section, cardId) {
        const list = section.querySelector('.comment-list');
        try {
            const res = await fetch(`${API}?card=${cardId}`);
            if (!res.ok) throw new Error('Network error');
            const comments = await res.json();
            list.innerHTML = '';
            if (comments.length === 0) {
                list.innerHTML = '<li class="comment-empty">Belum ada komentar. Jadilah yang pertama!</li>';
            } else {
                comments.forEach(c => list.appendChild(renderComment(c, cardId, section)));
            }
        } catch {
            list.innerHTML = '<li class="comment-empty comment-error">⚠️ Gagal memuat komentar. Pastikan server.py berjalan.</li>';
        }
    }

    /**
     * Delete a comment
     */
    async function deleteComment(section, cardId, commentId) {
        try {
            const res = await fetch(`${API}?card=${cardId}&id=${commentId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error();
            await loadComments(section, cardId);
        } catch {
            alert('Gagal menghapus komentar.');
        }
    }

    /**
     * Get public IP and hostname from ipapi.co (free, no key needed for basic use)
     * Falls back to 'unknown' if unavailable
     */
    async function getIdentity() {
        try {
            const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            return {
                ip: data.ip || 'unknown',
                hostname: data.hostname || data.org || data.ip || 'unknown'
            };
        } catch {
            return { ip: 'unknown', hostname: 'unknown' };
        }
    }

    /**
     * Submit a comment for a card
     */
    async function submitComment(section, cardId) {
        const textarea = section.querySelector('.comment-input');
        const btn = section.querySelector('.comment-submit');
        const text = textarea.value.trim();
        if (!text) { textarea.focus(); return; }

        btn.disabled = true;
        btn.textContent = 'Mengirim...';

        const { ip, hostname } = await getIdentity();

        try {
            const res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_id: cardId, text, hostname })
            });
            if (!res.ok) throw new Error();
            textarea.value = '';
            await loadComments(section, cardId);
        } catch {
            alert('Gagal mengirim komentar. Pastikan server.py berjalan di terminal.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Kirim';
        }
    }

    // ─── Wire up all comment sections ───────────────────────────────────
    document.querySelectorAll('.comment-section').forEach(section => {
        const cardId = section.dataset.cardId;

        // Load existing comments
        loadComments(section, cardId);

        // Submit on button click
        section.querySelector('.comment-submit').addEventListener('click', () => {
            submitComment(section, cardId);
        });

        // Submit on Ctrl+Enter
        section.querySelector('.comment-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                submitComment(section, cardId);
            }
        });
    });

});
