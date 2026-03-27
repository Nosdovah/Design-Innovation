document.addEventListener("DOMContentLoaded", () => {

    // ─── Turso Configuration ─────────────────────────────────────────────
    // Turso HTTP API is called directly from the browser — same pattern as
    // the previous Supabase anon key. Keep this read-write token safe, but
    // for a public comments section this is the accepted trade-off.
    const TURSO_URL   = 'https://design-innovation-nosdovah.aws-ap-northeast-1.turso.io';
    const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ2MjU3MjYsImlkIjoiMDE5ZDJmZWYtNDgwMS03YmM2LTg0MjQtYWZjYzkyM2JmY2ZiIiwicmlkIjoiN2QxYTg1MmQtY2Q0Ny00NmU0LTgyMzgtYWY2Y2E1NzFkODAyIn0.jdcS5UAoG-xO6WjSCnRz8d_eXv9BbK8YHEOmlVbhPsn-uP64rf6kY6TtvMZW1qQiKjNlQZx5aluJxnPkL0UFAg';

    /**
     * Execute a SQL statement against Turso via the HTTP pipeline API.
     * Returns { cols, rows, rows_affected } — rows is array-of-arrays.
     */
    async function tursoExec(sql, args = []) {
        const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
            method:  'POST',
            headers: {
                'Authorization': `Bearer ${TURSO_TOKEN}`,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({
                requests: [
                    {
                        type: 'execute',
                        stmt: {
                            sql,
                            args: args.map(v => ({ type: 'text', value: String(v) }))
                        }
                    },
                    { type: 'close' }
                ]
            })
        });

        if (!res.ok) throw new Error(`Turso HTTP ${res.status}`);
        const data = await res.json();

        const first = data.results[0];
        if (first.type === 'error') throw new Error(first.error.message);

        return first.response.result; // { cols, rows, rows_affected, last_insert_rowid }
    }

    /**
     * Map a Turso row (array of {type,value}) to a plain JS object using cols.
     */
    function rowToObj(cols, row) {
        const obj = {};
        cols.forEach((col, i) => { obj[col.name] = row[i]?.value ?? null; });
        return obj;
    }

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
            const target = document.querySelector(this.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // ─── Comment System (Turso direct HTTP API) ──────────────────────────

    /**
     * Render a single comment item into a <li>
     */
    function renderComment(c, cardId, section) {
        const li = document.createElement('li');
        li.className = 'comment-item';
        li.dataset.commentId = c.id;
        li.innerHTML = `
            <div class="comment-meta">
                <span class="comment-author">🖥️ ${escapeHtml(c.hostname || 'unknown')}</span>
                <span class="comment-ip">📡 ${escapeHtml(c.ip || 'unknown')}</span>
                <span class="comment-time">${escapeHtml(c.timestamp_display || c.created_at || '')}</span>
                <button class="comment-delete" title="Hapus Komentar">✕</button>
            </div>
            <p class="comment-text">${escapeHtml(c.text)}</p>
        `;

        li.querySelector('.comment-delete').addEventListener('click', () => {
            if (confirm('Hapus komentar ini?')) {
                deleteComment(section, cardId, c.id);
            }
        });

        return li;
    }

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
            const result = await tursoExec(
                'SELECT id, card_id, text, ip, hostname, timestamp_display, created_at ' +
                'FROM comments WHERE card_id = ? ORDER BY created_at ASC',
                [cardId]
            );

            const comments = result.rows.map(row => rowToObj(result.cols, row));
            list.innerHTML = '';
            if (comments.length === 0) {
                list.innerHTML = '<li class="comment-empty">Belum ada komentar. Jadilah yang pertama!</li>';
            } else {
                comments.forEach(c => list.appendChild(renderComment(c, cardId, section)));
            }
        } catch (err) {
            console.error(err);
            list.innerHTML = '<li class="comment-empty comment-error">⚠️ Gagal memuat komentar.</li>';
        }
    }

    /**
     * Get public IP and hostname from ipapi.co
     */
    async function getIdentity() {
        try {
            const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            return {
                ip:       data.ip       || 'unknown',
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
        const btn      = section.querySelector('.comment-submit');
        const text     = textarea.value.trim();
        if (!text) { textarea.focus(); return; }

        btn.disabled    = true;
        btn.textContent = 'Mengirim...';

        const { ip, hostname } = await getIdentity();
        const now = new Date();
        const timestamp_display = now.toLocaleString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }) + ' WITA';
        const id = now.toISOString();

        try {
            await tursoExec(
                'INSERT INTO comments (id, card_id, text, ip, hostname, timestamp_display, created_at) ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, cardId, text, ip, hostname, timestamp_display, id]
            );

            textarea.value = '';
            await loadComments(section, cardId);
        } catch (err) {
            console.error(err);
            alert('Gagal mengirim komentar: ' + err.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Kirim';
        }
    }

    /**
     * Delete a comment
     */
    async function deleteComment(section, cardId, commentId) {
        try {
            await tursoExec('DELETE FROM comments WHERE id = ?', [commentId]);
            await loadComments(section, cardId);
        } catch (err) {
            console.error(err);
            alert('Gagal menghapus komentar.');
        }
    }

    // ─── Wire up all comment sections ────────────────────────────────────
    document.querySelectorAll('.comment-section').forEach(section => {
        const cardId = section.dataset.cardId;
        loadComments(section, cardId);

        section.querySelector('.comment-submit').addEventListener('click', () => {
            submitComment(section, cardId);
        });

        section.querySelector('.comment-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                submitComment(section, cardId);
            }
        });
    });

});
