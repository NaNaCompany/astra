(function () {
    'use strict';
    const area = document.querySelector('[data-author-resources]');
    if (!area) return;
    const base = new URL(area.dataset.resourceBase);
    const rootFallback = 'https://bhban.kr/';

    function loadContactScript() {
        if (window.AuthorContact) return Promise.resolve(window.AuthorContact);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(() => { script.remove(); reject(new Error('Contact timeout')); }, 15000);
            script.src = new URL('contact.js', base).href;
            script.onload = () => {
                clearTimeout(timer);
                window.AuthorContact ? resolve(window.AuthorContact) : reject(new Error('Contact initializer unavailable'));
            };
            script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Contact script unavailable')); };
            document.head.append(script);
        });
    }

    function showError(host, kind) {
        const box = document.createElement('div');
        box.className = 'fragment-error';
        const message = document.createElement('p');
        message.textContent = kind === 'contact' ? '문의 양식을 불러오지 못했습니다.' : '책 목록을 불러오지 못했습니다.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = '다시 불러오기';
        retry.addEventListener('click', () => mount(host, kind));
        const link = document.createElement('a');
        link.href = rootFallback + (kind === 'contact' ? '#contact' : '#books');
        link.textContent = '작가 홈페이지에서 보기 ↗';
        box.append(message, retry, link);
        host.replaceChildren(box);
    }

    function prepareBooks(section) {
        const cards = [...section.querySelectorAll('.team-member')];
        for (const card of cards) {
            card.parentElement.classList.add('author-book');
            const title = card.querySelector('h5')?.textContent.trim() || '도서';
            const cover = card.querySelector('.bookcover');
            if (cover) { cover.alt = title; cover.loading = 'lazy'; cover.decoding = 'async'; }
            card.querySelectorAll('.bookstore').forEach(icon => {
                icon.loading = 'lazy';
                icon.decoding = 'async';
            });
            card.querySelectorAll('a[target="_blank"]').forEach(link => {
                link.rel = 'noopener noreferrer';
                const icon = link.querySelector('img');
                const store = icon?.src.match(/stores\/([^/.]+)/)?.[1];
                const names = {aladdin:'알라딘',kyobo:'교보문고',yes24:'YES24',naver:'네이버',ridi:'리디',ypmungo:'영풍문고'};
                link.setAttribute('aria-label', `${title} — ${names[store] || '서점'}에서 보기 (새 창)`);
            });
        }
    }

    async function mount(host, kind) {
        host.setAttribute('aria-busy', 'true');
        host.textContent = kind === 'contact' ? '문의 양식을 불러오는 중입니다.' : '책 목록을 불러오는 중입니다.';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(new URL(kind === 'contact' ? 'contact.html' : 'otherBooks.html', base), { signal:controller.signal });
            if (!response.ok) throw new Error('Shared resource unavailable');
            const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
            const section = parsed.querySelector(kind === 'contact' ? '#contact[data-contact-form]' : '#otherBooks');
            if (!section) throw new Error('Unexpected shared resource');
            section.querySelectorAll('script, iframe, object, embed, style, link').forEach(node => node.remove());
            // Shared HTML provides content; only the explicit contact initializer is executed.
            for (const element of [section, ...section.querySelectorAll('*')]) {
                for (const attribute of [...element.attributes]) {
                    if (/^on/i.test(attribute.name) || (/^(href|src|action)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))) element.removeAttribute(attribute.name);
                }
            }
            if (kind === 'contact') {
                const form = section.querySelector('form');
                const submit = form?.querySelector('[type="submit"]');
                if (!form || !submit) throw new Error('Contact form missing');
                submit.disabled = true;
                form.setAttribute('aria-label', '강연 및 협업 문의');
                section.querySelectorAll('.form-group').forEach(group => group.classList.add('author-field'));
                host.replaceChildren(section);
                const contact = await loadContactScript();
                contact.init(section);
                if (form.dataset.contactReady !== 'true') throw new Error('Contact not initialized');
                submit.disabled = false;
            } else {
                prepareBooks(section);
                host.replaceChildren(section);
            }
        } catch (error) {
            showError(host, kind);
        } finally {
            clearTimeout(timer);
            host.removeAttribute('aria-busy');
        }
    }
    function start() {
        area.querySelectorAll('[data-shared-fragment]').forEach(host => mount(host, host.dataset.sharedFragment));
    }
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
        }, { rootMargin:'900px 0px' });
        observer.observe(area);
    } else start();
})();
