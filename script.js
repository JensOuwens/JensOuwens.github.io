(() => {
  const JSON_PATH = 'projects.json';

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const getLengthBucket = (months) => {
    if (months < 1) return 'micro';
    if (months <= 3) return 'short';
    if (months <= 6) return 'medium';
    return 'long';
  };

  const lengthLabels = {
    micro: 'Micro · under 1 month',
    short: 'Short · 1–3 months',
    medium: 'Medium · 4–6 months',
    long: 'Long · 7+ months'
  };

  const unique = (items) => [...new Set(items.flat().filter(Boolean))].sort((a, b) => a.localeCompare(b));

  async function loadData() {
    const response = await fetch(JSON_PATH, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${JSON_PATH}`);
    return response.json();
  }

  function renderProjectCard(project) {
    const labels = [project.engine, ...(project.roles || []).slice(0, 1), project.lengthLabel].filter(Boolean);
    return `
      <a class="project-card ${project.draft ? 'is-template' : ''}" href="individual-project.html?id=${encodeURIComponent(project.id)}">
        <div class="project-card-image">
          <img src="${escapeHtml(project.hero || 'media/project-placeholder.svg')}" alt="${escapeHtml(project.heroAlt || project.title)}" loading="lazy">
          <div class="folio-chip">${project.draft ? 'TEMPLATE' : 'FOLIO ' + escapeHtml(String(project.year).slice(-2))}</div>
        </div>
        <div class="project-card-body">
          <div class="project-card-kicker">${escapeHtml(project.status || 'Project')}</div>
          <h2>${escapeHtml(project.title)}</h2>
          <p>${escapeHtml(project.subtitle || project.summary || '')}</p>
          <div class="project-meta">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</div>
        </div>
      </a>
    `;
  }

  async function initProjectsPage() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    try {
      const data = await loadData();
      const projects = Array.isArray(data.projects) ? data.projects : [];
      const search = document.getElementById('project-search');
      const length = document.getElementById('filter-length');
      const engine = document.getElementById('filter-engine');
      const role = document.getElementById('filter-role');
      const status = document.getElementById('filter-status');
      const sort = document.getElementById('filter-sort');
      const clear = document.getElementById('clear-filters');
      const count = document.getElementById('project-count');
      const note = document.getElementById('filter-note');
      const empty = document.getElementById('projects-empty');

      const engines = unique(projects.map(p => p.engine));
      const roles = unique(projects.map(p => p.roles || []));
      const statuses = unique(projects.map(p => p.status));

      engines.forEach(item => engine.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`));
      roles.forEach(item => role.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`));
      statuses.forEach(item => status.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`));
      Object.entries(lengthLabels).forEach(([value, label]) => length.insertAdjacentHTML('beforeend', `<option value="${value}">${escapeHtml(label)}</option>`));

      function applyFilters() {
        const searchTerm = search.value.trim().toLowerCase();
        const selectedLength = length.value;
        const selectedEngine = engine.value;
        const selectedRole = role.value;
        const selectedStatus = status.value;
        const selectedSort = sort.value;

        let result = projects.filter(project => {
          const haystack = [
            project.title,
            project.subtitle,
            project.summary,
            project.engine,
            project.status,
            ...(project.roles || []),
            ...(project.tags || []),
            ...(project.stack || [])
          ].join(' ').toLowerCase();

          return (!searchTerm || haystack.includes(searchTerm))
            && (selectedLength === 'all' || getLengthBucket(Number(project.lengthMonths || 0)) === selectedLength)
            && (selectedEngine === 'all' || project.engine === selectedEngine)
            && (selectedRole === 'all' || (project.roles || []).includes(selectedRole))
            && (selectedStatus === 'all' || project.status === selectedStatus);
        });

        result.sort((a, b) => {
          if (selectedSort === 'title-asc') return a.title.localeCompare(b.title);
          if (selectedSort === 'length-asc') return Number(a.lengthMonths || 0) - Number(b.lengthMonths || 0);
          if (selectedSort === 'length-desc') return Number(b.lengthMonths || 0) - Number(a.lengthMonths || 0);
          return Number(b.year || 0) - Number(a.year || 0);
        });

        grid.innerHTML = result.map(renderProjectCard).join('');
        count.textContent = `${result.length} ${result.length === 1 ? 'folio' : 'folios'}`;
        note.textContent = result.some(p => p.draft) ? 'Template folio included — replace or remove it in projects.json.' : '';
        empty.hidden = result.length !== 0;
      }

      [search, length, engine, role, status, sort].forEach(control => control.addEventListener('input', applyFilters));
      clear.addEventListener('click', () => {
        search.value = '';
        length.value = 'all';
        engine.value = 'all';
        role.value = 'all';
        status.value = 'all';
        sort.value = 'year-desc';
        applyFilters();
      });

      applyFilters();
    } catch (error) {
      grid.innerHTML = `<div class="load-error"><strong>Project index unavailable.</strong><span>${escapeHtml(error.message)}</span><small>Serve the folder over HTTP (for example with <code>python -m http.server</code>) so the JSON file can be fetched.</small></div>`;
    }
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value ?? '—';
  }

  function renderTagCloud(id, items) {
    const node = document.getElementById(id);
    if (!node) return;
    node.innerHTML = (items || []).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('');
  }

  async function initProjectDetail() {
    const detail = document.getElementById('project-detail');
    if (!detail) return;

    try {
      const data = await loadData();
      const projects = Array.isArray(data.projects) ? data.projects : [];
      const requestedId = new URLSearchParams(window.location.search).get('id');
      const project = projects.find(p => p.id === requestedId) || projects.find(p => !p.draft) || projects[0];

      if (!project) throw new Error('No project found.');

      document.title = `The Portfolio Codex — ${project.title}`;
      setText('detail-folio', `FOL. ${String(project.year || '').slice(-2)}R`);
      setText('detail-kicker', project.draft ? 'TEMPLATE FOLIO · EDIT ME' : `PROJECT FOLIO · ${String(project.year || '—')}`);
      setText('detail-title', project.title);
      setText('detail-subtitle', project.subtitle);
      setText('detail-status', project.status);
      setText('detail-year', project.year);
      setText('detail-length', project.lengthLabel || `${project.lengthMonths || '—'} months`);
      setText('detail-engine', project.engine);
      setText('detail-roles', (project.roles || []).join(' · '));
      setText('detail-summary', project.summary);
      setText('detail-caption', project.caption);
      setText('detail-colophon', project.draft ? 'Template folio — duplicate this object in projects.json to create a new project.' : `Indexed under ${project.engine} · ${project.status}.`);

      const image = document.getElementById('detail-image');
      image.src = project.hero || 'media/project-placeholder.svg';
      image.alt = project.heroAlt || project.title;

      renderTagCloud('detail-stack-list', project.stack);
      renderTagCloud('detail-tags', project.tags);

      const sections = document.getElementById('detail-sections');
      sections.innerHTML = (project.sections || []).map(section => `
        <article class="detail-section">
          <div class="section-number">${String(project.sections.indexOf(section) + 1).padStart(2, '0')}</div>
          <div><p class="section-kicker">NOTE</p><h2>${escapeHtml(section.heading || '')}</h2><p>${escapeHtml(section.body || '')}</p></div>
        </article>`).join('');

      const contribution = document.getElementById('detail-contribution');
      contribution.innerHTML = (project.contribution || []).map((item, index) => `<div><span>${String(index + 1).padStart(2, '0')}</span><p>${escapeHtml(item)}</p></div>`).join('');

      const links = document.getElementById('detail-links');
      links.innerHTML = (project.links || []).map(link => `<a href="${escapeHtml(link.url || '#')}" target="_blank" rel="noopener">${escapeHtml(link.label || link.url || 'Open link')} <span>↗</span></a>`).join('') || '<span class="quiet">No links listed.</span>';

      const galleryWrap = document.getElementById('detail-gallery-wrap');
      const gallery = document.getElementById('detail-gallery');
      if (Array.isArray(project.gallery) && project.gallery.length) {
        galleryWrap.hidden = false;
        gallery.innerHTML = project.gallery.map(item => `
          <figure><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt || '')}" loading="lazy"><figcaption>${escapeHtml(item.caption || '')}</figcaption></figure>
        `).join('');
      }
    } catch (error) {
      detail.innerHTML = `<div class="load-error"><strong>Project folio unavailable.</strong><span>${escapeHtml(error.message)}</span><a href="projects.html">Return to project index</a></div>`;
    }
  }

  initProjectsPage();
  initProjectDetail();
})();
