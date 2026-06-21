// ============================================================
//   粒子特效引擎 (Canvas)
// ============================================================
const ParticleEngine = {
    canvas: null,
    ctx: null,
    particles: [],
    mouse: {
        x: null,
        y: null,
        radius: 140
    },
    width: 0,
    height: 0,
    rafId: null,
    colors: ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b'],

    init() {
        this.canvas = document.getElementById('particleCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createParticles();
        this.bindEvents();
        this.animate();
    },

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    },

    createParticles() {
        this.particles = [];
        const count = Math.min(
            Math.floor((this.width * this.height) / 12000),
            100
        );
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                size: Math.random() * 2.5 + 1,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                alpha: Math.random() * 0.5 + 0.3,
            });
        }
    },

    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.createParticles();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        window.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });

        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length) {
                this.mouse.x = e.touches[0].clientX;
                this.mouse.y = e.touches[0].clientY;
            }
        });
    },

    animate() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // 1) 绘制粒子间的连线（近距离）
        this.drawConnections();

        // 2) 绘制粒子
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];

            // 运动
            p.x += p.vx;
            p.y += p.vy;

            // 边界反弹
            if (p.x < 0 || p.x > this.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.height) p.vy *= -1;

            // 鼠标引力
            if (this.mouse.x !== null) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.mouse.radius) {
                    const force = (this.mouse.radius - dist) / this.mouse.radius;
                    p.x += (dx / dist) * force * 1.5;
                    p.y += (dy / dist) * force * 1.5;
                }
            }

            // 绘制发光圆
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.shadowBlur = 12;
            ctx.shadowColor = p.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = 1;
        this.rafId = requestAnimationFrame(() => this.animate());
    },

    drawConnections() {
        const ctx = this.ctx;
        const maxDist = 130;
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < maxDist) {
                    const alpha = 1 - dist / maxDist;
                    ctx.beginPath();
                    ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    ctx.strokeStyle = `rgba(99, 102, 241, ${alpha * 0.18})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
    },
};

// ============================================================
//   Markdown 解析器 + 内容加载
// ============================================================

function parseFieldLine(line) {
    const m = line.match(/^\s*-\s*([\w\u4e00-\u9fa5_]+?)\s*:\s*(.*)$/);
    if (!m) return null;
    let key = m[1].trim();
    let val = m[2].trim();

    if (val.startsWith('[') && val.endsWith(']')) {
        try {
            val = JSON.parse(val);
        } catch (e) {
            /* keep string */
        }
    } else if (val === 'true' || val === 'false') {
        val = val === 'true';
    } else if (/^\d+$/.test(val)) {
        val = parseInt(val, 10);
    } else {
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
    }
    return {
        key,
        val
    };
}

function splitSections(markdown) {
    const lines = markdown.split(/\r?\n/);
    const sections = [];
    let cur = null;

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^##\s+/.test(line)) {
            if (cur) sections.push(cur);
            cur = {
                title: line.replace(/^##\s+/, '').trim(),
                fields: {},
                body: []
            };
            continue;
        }
        if (!cur) continue;
        const field = parseFieldLine(line);
        if (field) {
            cur.fields[field.key] = field.val;
            continue;
        }
        cur.body.push(raw);
    }
    if (cur) sections.push(cur);
    return sections;
}

async function loadMd(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('加载失败: ' + path);
    return await res.text();
}

// ============================================================
//   主渲染逻辑
// ============================================================

async function bootstrapFromMarkdown() {
    try {
        const [profileMd, skillsMd, projectsMd, contactMd] = await Promise.all([
            loadMd('data/profile.md'),
            loadMd('data/skills.md'),
            loadMd('data/projects.md'),
            loadMd('data/contact.md'),
        ]);

        const profileSecs = splitSections(profileMd);
        const skillsSecs = splitSections(skillsMd).filter(s => s.title !== '说明');
        const projectsSecs = splitSections(projectsMd).filter(s => s.title !== '说明');
        const contactSecs = splitSections(contactMd);

        const basic = findFields(profileSecs, '基本信息') || {};
        const hero = findFields(profileSecs, 'Hero') ||
            findFields(profileSecs, 'Hero 区') || {};
        const stats = findFields(profileSecs, '数据统计') || {};
        const aboutBody = findSection(profileSecs, '关于我') ||
            findSection(profileSecs, '关于');

        // ---- 文本填充 ----
        document.title = (basic.name || 'Portfolio') + ' | ' + (basic.title || '');

        setHtml('[data-md="nav_logo"]', (basic.name || 'Portfolio') + '.');
        setHtml('[data-md="hero_greeting"]', hero.greeting || '你好，我是');
        setHtml('[data-md="hero_subtitle"]', hero.subtitle || basic.title || '');
        setHtml('[data-md="hero_desc"]', hero.description || hero.desc || '');
        setHtml('[data-md="hero_btn_primary"]', '查看作品');
        setHtml('[data-md="hero_btn_outline"]', '联系我');
        setHtml('[data-md="scroll_hint"]', '向下滚动');
        setHtml('[data-md="about_tag"]', '关于我');
        setHtml('[data-md="about_title"]', basic.name || '个人介绍');
        setHtml('[data-md="about_h3"]', '一位热爱创造的开发者');
        setHtml('[data-md="about_avatar"]',
            basic.avatar_letter ||
            (basic.name ? basic.name.charAt(0).toUpperCase() : 'P'));
        setHtml('[data-md="about_btn"]', '下载简历');
        // ---- 设置下载简历按钮的 PDF 链接 ----
        const pdfUrl = basic.resume_url || 'assets/resume.pdf';
        const resumeBtn = document.querySelector('[data-md="about_btn"]');
        if (resumeBtn && resumeBtn.parentElement && resumeBtn.parentElement.tagName === 'A') {
            resumeBtn.parentElement.setAttribute('href', pdfUrl);
            resumeBtn.parentElement.setAttribute('download', '');
            resumeBtn.parentElement.setAttribute('target', '_blank');
            resumeBtn.parentElement.setAttribute('rel', 'noopener');
        }
        // ---- 预览简历弹窗：绑定 URL + 事件 ----
        const previewBtn = document.getElementById('previewResumeBtn');
        const modal = document.getElementById('resumeModal');
        const modalClose = document.getElementById('resumeModalClose');
        const modalBackdrop = modal ? modal.querySelector('.modal-backdrop') : null;
        const modalDownload = document.getElementById('resumeModalDownload');
        const resumeIframe = document.getElementById('resumeIframe');

        function openResumeModal() {
            if (!modal || !resumeIframe) return;
            // Chrome/Edge 等基于 Chromium 的 PDF 阅读器支持通过 URL 片段
            // 控制默认 UI：pagemode=none 关闭左侧缩略图栏，navpanes=0 隐藏导航面板
            resumeIframe.setAttribute('src', pdfUrl + '#pagemode=none&navpanes=0&toolbar=1&statusbar=0&messages=0');
            if (modalDownload) {
                modalDownload.setAttribute('href', pdfUrl);
                modalDownload.setAttribute('download', '');
                modalDownload.setAttribute('target', '_blank');
            }
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function closeResumeModal() {
            if (!modal || !resumeIframe) return;
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            resumeIframe.setAttribute('src', '');
            document.body.style.overflow = '';
        }

        if (previewBtn) {
            previewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openResumeModal();
            });
        }
        if (modalClose) {
            modalClose.addEventListener('click', closeResumeModal);
        }
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', closeResumeModal);
        }
        // ESC 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
                closeResumeModal();
            }
        });
        setHtml('[data-md="skills_tag"]', '技能');
        setHtml('[data-md="skills_title"]', '我能做什么');
        setHtml('[data-md="projects_tag"]', '作品');
        setHtml('[data-md="projects_title"]', '最新项目展示');
        setHtml('[data-md="contact_tag"]', '联系方式');
        setHtml('[data-md="contact_title"]', '让我们开始合作吧');
        setHtml('[data-md="contact_btn"]', '发送消息');
        setHtml('[data-md="footer_copyright"]',
            '&copy; 2026 ' + (basic.name || 'Portfolio') + ' · 精心打造');

        // ---- About 正文（Markdown -> HTML）----
        if (aboutBody) {
            const bodyText = aboutBody.body.join('\n').trim();
            const target = document.querySelector('[data-md="about_body"]');
            if (target) {
                if (window.marked) target.innerHTML = window.marked.parse(bodyText);
                else target.textContent = bodyText;
            }
        }

        // ---- 关于我：信息卡片 ----
        const aboutInfo = document.getElementById('aboutInfo');
        if (aboutInfo) {
            aboutInfo.innerHTML = `
        <div class="info-item"><span>姓名</span><p>${escapeHtml(basic.name || '-')}</p></div>
        <div class="info-item"><span>邮箱</span><p>${escapeHtml(basic.email || '-')}</p></div>
        <div class="info-item"><span>位置</span><p>${escapeHtml(basic.location || '-')}</p></div>
        <div class="info-item"><span>状态</span><p class="${basic.available ? 'available' : ''}">${basic.available ? '正在接单' : '暂不接单'}</p></div>
      `;
        }

        // ---- Hero 数据统计 ----
        const heroStats = document.getElementById('heroStats');
        if (heroStats) {
            const stat1Label = stats.stat1_label || '完成项目';
            const stat2Label = stats.stat2_label || '满意客户';
            const stat3Label = stats.stat3_label || '年经验';
            heroStats.innerHTML = `
        <div class="stat">
          <span class="stat-num" data-target="${stats.stat1_value || 10}">0</span><span class="stat-plus">+</span>
          <p>${escapeHtml(stat1Label)}</p>
        </div>
        <div class="stat">
          <span class="stat-num" data-target="${stats.stat2_value || 30}">0</span><span class="stat-plus">+</span>
          <p>${escapeHtml(stat2Label)}</p>
        </div>
        <div class="stat">
          <span class="stat-num" data-target="${stats.stat3_value || 5}">0</span><span class="stat-plus"></span>
          <p>${escapeHtml(stat3Label)}</p>
        </div>
      `;
        }

        // ---- 保存打字机标题数组到全局 ----
        window.__typewriterTitles = Array.isArray(hero.typewriter_titles) ?
            hero.typewriter_titles : [(basic.name || 'Portfolio') + ' · ' + (basic.title || '')];

        // ---- Skills ----
        const skillsGrid = document.getElementById('skillsGrid');
        if (skillsGrid) {
            skillsGrid.innerHTML = skillsSecs.map(s => {
                const tags = Array.isArray(s.fields.tags) ? s.fields.tags : [];
                return `
          <div class="skill-card reveal">
            <div class="skill-icon">${s.fields.icon || '&#128187;'}</div>
            <h3>${escapeHtml(s.title)}</h3>
            <p>${escapeHtml(s.fields.description || '')}</p>
            <div class="skill-tags">
              ${tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}
            </div>
            <div class="skill-bar">
              <div class="skill-progress" data-progress="${s.fields.percent || 70}"></div>
            </div>
            <span class="skill-percent">${s.fields.percent || 70}%</span>
          </div>
        `;
            }).join('');
        }

        // ---- Projects ----
        const categories = ['all', ...new Set(projectsSecs.map(p => p.fields.category).filter(Boolean))];
        const filterTabs = document.getElementById('filterTabs');
        if (filterTabs) {
            filterTabs.innerHTML = categories.map((cat, idx) => {
                const label = catLabel(cat);
                return `<button class="filter-btn ${idx === 0 ? 'active' : ''}" data-filter="${cat}">${label}</button>`;
            }).join('');
        }

        const projectsGrid = document.getElementById('projectsGrid');
        if (projectsGrid) {
            projectsGrid.innerHTML = projectsSecs.map(p => {
                const stack = Array.isArray(p.fields.stack) ? p.fields.stack : [];
                const isCompany = p.fields.category === 'company' || p.fields.category === 'hd'
                const url = p.fields.url || '#project-' + encodeURIComponent(p.title || '');
                const detailBtn = !isCompany ?
                    `<a href="${escapeHtml(url)}" class="project-detail-btn" target="_blank" rel="noopener">
               <span>查看详情</span>
               <span class="arrow">&rarr;</span>
             </a>` :
                    '';
                return `
          <div class="project-card reveal ${isCompany ? 'project-card-company' : ''}" data-category="${p.fields.category || 'web'}">
            <span class="project-tag">${catLabel(p.fields.category || 'web')}</span>
            <h3>${escapeHtml(p.title)}</h3>
            <div class="project-stack">
              ${stack.map(s => `<span>${escapeHtml(s)}</span>`).join('')}
            </div>
            ${detailBtn}
          </div>
        `;
            }).join('');
        }

        // ---- Contact ----
        const contactInfo = document.getElementById('contactInfo');
        if (contactInfo) {
            contactInfo.innerHTML = `
        <div class="contact-item">
          <div class="contact-icon">&#128231;</div>
          <div><span>邮箱</span><p>${escapeHtml(basic.email || '-')}</p></div>
        </div>
        <div class="contact-item">
          <div class="contact-icon">&#128222;</div>
          <div><span>电话</span><p>${escapeHtml(basic.phone || '-')}</p></div>
        </div>
        <div class="contact-item">
          <div class="contact-icon">&#128205;</div>
          <div><span>地址</span><p>${escapeHtml(basic.location || '-')}</p></div>
        </div>
        <div class="social-links"></div>
      `;
        }

        const social = findFields(contactSecs, '社交') || findFields(contactSecs, '社交链接') || {};
        const socialLinksEl = document.querySelector('#contactInfo .social-links');
        if (socialLinksEl) {
            // 常用平台使用 SVG 图标，其他回退为首字母
            const iconGithub = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.6 5.63.6 11.9c0 5.02 3.29 9.27 7.86 10.77.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.74.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.3-.52-1.48.11-3.09 0 0 .97-.31 3.18 1.18a10.98 10.98 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.61.23 2.79.11 3.09.74.8 1.19 1.83 1.19 3.08 0 4.42-2.69 5.39-5.25 5.67.42.36.78 1.07.78 2.16v3.2c0 .31.2.67.8.56 4.56-1.5 7.85-5.75 7.85-10.77C23.4 5.63 18.27.5 12 .5z"/></svg>';
            const iconEmail = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></svg>';
            const iconLinkedIn = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.86-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.86 3.38-1.86 3.61 0 4.28 2.37 4.28 5.46v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zm1.78 13.02H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45C23.2 24 24 23.23 24 22.28V1.72C24 .77 23.2 0 22.23 0z"/></svg>';
            const iconTwitter = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.63l-5.197-6.78-5.91 6.78h-3.22l7.73-8.788L1.9 2.25h6.804l4.66 6.14 5.672-6.14zm-1.02 18.3h1.96l12.3-18.3z"/></svg>';

            socialLinksEl.innerHTML = Object.entries(social).map(([key, value]) => {
                const k = String(key).toLowerCase().trim();
                const v = String(value).trim();
                let href = v;
                let icon = v.charAt(0).toUpperCase();
                let extraAttrs = '';
                let iconClass = 'social-text';
                if (k === 'github') {
                    href = v;
                    icon = iconGithub;
                    iconClass = 'social-icon';
                    extraAttrs = ' target="_blank" rel="noopener"';
                } else if (k === 'email') {
                    href = 'mailto:' + v;
                    icon = iconEmail;
                    iconClass = 'social-icon';
                    // 把邮箱地址存到表单上，供右侧表单使用
                    const cf = document.getElementById('contactForm');
                    if (cf) cf.dataset.contactEmail = v;
                } else if (k === 'linkedin') {
                    href = v;
                    icon = iconLinkedIn;
                    iconClass = 'social-icon';
                    extraAttrs = ' target="_blank" rel="noopener"';
                } else if (k === 'twitter' || k === 'x') {
                    href = v;
                    icon = iconTwitter;
                    iconClass = 'social-icon';
                    extraAttrs = ' target="_blank" rel="noopener"';
                } else if (/^https?:\/\//.test(v)) {
                    extraAttrs = ' target="_blank" rel="noopener"';
                    icon = v.replace(/^https?:\/\//, '').split('.')[0].charAt(0).toUpperCase();
                }
                return `<a href="${escapeHtml(href)}" class="social-link" title="${escapeHtml(v)}"${extraAttrs}><span class="${iconClass}">${icon}</span></a>`;
            }).join('');
        }

        // ---- 触发后续交互初始化 ----
        initInteractions();
    } catch (err) {
        console.error('[Markdown 加载失败]', err);
        const fallback = document.createElement('div');
        fallback.style.cssText = 'padding:16px 24px;background:rgba(236,72,153,0.15);color:#ec4899;font-weight:600;';
        fallback.textContent = '⚠ 内容加载失败：请通过 HTTP 服务器访问页面（不要直接双击 HTML）';
        document.body.insertBefore(fallback, document.body.firstChild);
    }
}

// ---- 辅助函数 ----
function findSection(sections, keyword) {
    return sections.find(s => s.title.includes(keyword)) || null;
}

function findFields(sections, keyword) {
    const s = findSection(sections, keyword);
    return s ? s.fields : null;
}

function catLabel(cat) {
    const map = {
        web: '网页',
        app: '应用',
        design: '设计',
        company: '公司项目',
        xcx: '小程序',
        hd: '后端',
        all: '全部'
    };
    return map[cat] || cat;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setHtml(selector, html) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = html;
}

// ============================================================
//   交互脚本 (等内容加载完再执行)
// ============================================================

function initInteractions() {
    // ---- Navbar 滚动效果 ----
    const navbar = document.querySelector('.navbar');
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section');

    window.addEventListener('scroll', () => {
        if (navbar) {
            if (window.scrollY > 50) navbar.classList.add('scrolled');
            else navbar.classList.remove('scrolled');
        }

        const backToTop = document.getElementById('backToTop');
        if (backToTop) {
            if (window.scrollY > 400) backToTop.classList.add('visible');
            else backToTop.classList.remove('visible');
        }

        let current = '';
        sections.forEach(section => {
            if (window.scrollY >= section.offsetTop - 120) {
                current = section.getAttribute('id');
            }
        });
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) link.classList.add('active');
        });
    });

    // ---- 移动端菜单 ----
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('open');
        });
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('open');
            });
        });
    }

    // ---- 回到顶部 ----
    const backToTop = document.getElementById('backToTop');
    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // ---- 打字机效果 ----
    const heroTitle = document.querySelector('[data-md="hero_title_placeholder"]');
    if (heroTitle) {
        const phrases = window.__typewriterTitles || ['Portfolio'];
        let phraseIndex = 0;
        let charIndex = 0;
        let isDeleting = false;

        heroTitle.textContent = phrases[0];
        heroTitle.classList.add('typewriter');

        function tick() {
            const current = phrases[phraseIndex];
            if (isDeleting) {
                heroTitle.textContent = current.substring(0, charIndex - 1);
                charIndex--;
            } else {
                heroTitle.textContent = current.substring(0, charIndex + 1);
                charIndex++;
            }

            let delay = isDeleting ? 60 : 110;
            if (!isDeleting && charIndex === current.length) {
                delay = 2400;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                delay = 600;
            }
            setTimeout(tick, delay);
        }

        if (phrases.length > 1) {
            charIndex = heroTitle.textContent.length;
            setTimeout(tick, 1500);
        }
    }

    // ---- 数字计数器 ----
    const statNums = document.querySelectorAll('.stat-num');
    let statsDone = false;

    function checkStats() {
        if (statsDone) return;
        const hero = document.querySelector('.hero');
        if (hero && hero.getBoundingClientRect().top < window.innerHeight) {
            statsDone = true;
            statNums.forEach(num => {
                const target = parseInt(num.getAttribute('data-target')) || 0;
                const step = target / 60;
                let cur = 0;
                const update = () => {
                    cur += step;
                    if (cur < target) {
                        num.textContent = Math.ceil(cur);
                        requestAnimationFrame(update);
                    } else {
                        num.textContent = target;
                    }
                };
                update();
            });
        }
    }
    window.addEventListener('scroll', checkStats);
    setTimeout(checkStats, 400);

    // ---- Reveal 滚动渐显 ----
    const revealEls = document.querySelectorAll(
        '.about-content, .skill-card, .project-card, .contact-content, .section-header'
    );
    revealEls.forEach(el => el.classList.add('reveal'));

    function checkReveal() {
        revealEls.forEach(el => {
            if (el.getBoundingClientRect().top < window.innerHeight - 80) {
                el.classList.add('active');
            }
        });
    }
    window.addEventListener('scroll', checkReveal);
    checkReveal();

    // ---- 技能进度条 ----
    let skillsDone = false;

    function checkSkills() {
        if (skillsDone) return;
        const sec = document.querySelector('.skills');
        if (!sec) return;
        if (sec.getBoundingClientRect().top < window.innerHeight - 100) {
            skillsDone = true;
            document.querySelectorAll('.skill-progress').forEach(bar => {
                bar.style.width = bar.getAttribute('data-progress') + '%';
            });
        }
    }
    window.addEventListener('scroll', checkSkills);
    setTimeout(checkSkills, 200);

    // ---- 项目过滤 ----
    const filterBtns = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.getAttribute('data-filter');
            projectCards.forEach(card => {
                if (filter === 'all' || card.getAttribute('data-category') === filter) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    });

    // ---- 联系表单 ----
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', e => {
            e.preventDefault();
            const formData = new FormData(contactForm);
            const name = (formData.get('name') || '').toString().trim();
            const email = (formData.get('email') || '').toString().trim();
            const subject = (formData.get('subject') || '').toString().trim();
            const message = (formData.get('message') || '').toString().trim();
            const to = contactForm.dataset.contactEmail || '';
            if (!to) return;

            // 拼装正文：附上姓名、回复邮箱与时间
            const now = new Date().toLocaleString();
            const body =
                `${message}\n\n` +
                `─────────────────────────\n` +
                `姓名：${name || '（未填写）'}\n` +
                `邮箱：${email || '（未填写）'}\n` +
                `时间：${now}\n` +
                `来自：${window.location.href}`;

            const mailto =
                `mailto:${encodeURIComponent(to)}` +
                `?subject=${encodeURIComponent(subject || `来自 ${name || '访客'} 的消息`)}` +
                `&body=${encodeURIComponent(body)}`;

            const btn = contactForm.querySelector('button[type="submit"]');
            const original = btn.innerHTML;
            btn.innerHTML = '打开邮件客户端...';
            window.location.href = mailto;
            setTimeout(() => {
                btn.innerHTML = '&#10003; 已为你打开邮件客户端';
                setTimeout(() => {
                    btn.innerHTML = original;
                    contactForm.reset();
                }, 2500);
            }, 500);
        });
    }

    // ---- 平滑滚动 ----
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) {
                e.preventDefault();
                window.scrollTo({
                    top: target.offsetTop - 70,
                    behavior: 'smooth'
                });
            }
        });
    });

    console.log('%c Portfolio 已加载 · ', 'background:#6366f1;color:#fff;padding:4px 12px;border-radius:6px;',
        '粒子特效 + 毛玻璃 + 霓虹光晕');
}

// ============================================================
//   启动
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    ParticleEngine.init();
    bootstrapFromMarkdown();
});