document.addEventListener("DOMContentLoaded", () => {

    // ─── Supabase Configuration ──────────────────────────────────────────
    const SUPABASE_URL = 'https://dwzzypcvvlkmaqiczefm.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3enp5cGN2dmxrbWFxaWN6ZWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTUwMTQsImV4cCI6MjA4OTI5MTAxNH0.kybZBCZcCR6e2f0w968LAmYPZgEGPrNZ16TajFUwaq4';
    
    // Initialize Supabase from the global 'supabase' object provided by the CDN
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

    // ─── Comment System (Supabase) ───────────────────────────────────────

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
                <span class="comment-time">${escapeHtml(c.timestamp_display || c.created_at)}</span>
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
        if (!supabaseClient) {
            list.innerHTML = '<li class="comment-empty comment-error">⚠️ Konfigurasi Supabase belum lengkap di script.js</li>';
            return;
        }

        try {
            const { data, error } = await supabaseClient
                .from('comments')
                .select('*')
                .eq('card_id', cardId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            list.innerHTML = '';
            if (!data || data.length === 0) {
                list.innerHTML = '<li class="comment-empty">Belum ada komentar. Jadilah yang pertama!</li>';
            } else {
                data.forEach(c => list.appendChild(renderComment(c, cardId, section)));
            }
        } catch (err) {
            console.error(err);
            list.innerHTML = '<li class="comment-empty comment-error">⚠️ Gagal memuat komentar dari Supabase.</li>';
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
        if (!supabaseClient) {
            alert('Konfigurasi Supabase belum lengkap di script.js');
            return;
        }

        const textarea = section.querySelector('.comment-input');
        const btn = section.querySelector('.comment-submit');
        const text = textarea.value.trim();
        if (!text) { textarea.focus(); return; }

        btn.disabled = true;
        btn.textContent = 'Mengirim...';

        const { ip, hostname } = await getIdentity();
        const timestamp_display = new Date().toLocaleString('id-ID', { 
            day: 'numeric', month: 'short', year: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
        }) + ' WITA';

        try {
            const { error } = await supabaseClient
                .from('comments')
                .insert([{ 
                    card_id: cardId, 
                    text: text, 
                    ip: ip, 
                    hostname: hostname,
                    timestamp_display: timestamp_display
                }]);

            if (error) throw error;
            
            textarea.value = '';
            await loadComments(section, cardId);
        } catch (err) {
            console.error(err);
            alert('Gagal mengirim komentar ke Supabase.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Kirim';
        }
    }

    /**
     * Delete a comment
     */
    async function deleteComment(section, cardId, commentId) {
        if (!supabaseClient) return;

        try {
            const { error } = await supabaseClient
                .from('comments')
                .delete()
                .eq('id', commentId);

            if (error) throw error;
            await loadComments(section, cardId);
        } catch (err) {
            console.error(err);
            alert('Gagal menghapus komentar.');
        }
    }

    // ─── Wire up all comment sections ───────────────────────────────────
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
