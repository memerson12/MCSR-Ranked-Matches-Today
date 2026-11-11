// The explorer fetches the command's real endpoint; it never substitutes sample JSON.
window.CommandApiDetails = (() => {
  const states = new Map();
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const stateFor = (id) => {
    if (!states.has(id)) states.set(id, { values: {}, open: false, response: null, controller: null });
    return states.get(id);
  };

  function markup(item) {
    const api = item.api;
    const fields = api.parameters.map((parameter) => {
      const id = `api-${item.id}-${parameter.name}`;
      return `<div class="api-parameter">
        <label for="${id}"><code>${escapeHtml(parameter.name)}</code> <span>${escapeHtml(parameter.requirement)}</span></label>
        <input id="${id}" name="${escapeHtml(parameter.name)}" aria-describedby="${id}-help" autocomplete="off" spellcheck="false" />
        <p id="${id}-help">${escapeHtml(parameter.description)}</p>
      </div>`;
    }).join("");
    return `<details class="api-details" data-api-details="${item.id}">
      <summary>API response &amp; parameters</summary>
      <div class="api-body">
        <p class="api-endpoint"><strong>GET</strong> <code>${escapeHtml(api.endpoint)}</code></p>
        ${api.note ? `<p class="api-note">${escapeHtml(api.note)}</p>` : ""}
        <form data-api-form="${item.id}">
          <div class="api-parameters">${fields || '<p class="api-note">No query parameters.</p>'}</div>
          <p class="api-request-label">Request URL <a data-api-link target="_blank" rel="noreferrer"></a></p>
          <button class="api-fetch" type="submit">${api.sideEffect ? "Roll and load response" : "Fetch response"}</button>
        </form>
        <p class="api-status" data-api-status role="status" aria-live="polite"></p>
        <pre class="api-response" tabindex="0" aria-label="Actual API response"><code data-api-response></code></pre>
      </div>
    </details>`;
  }

  function requestUrl(item, form) {
    const url = new URL(item.api.endpoint, location.origin);
    for (const [name, value] of new FormData(form)) {
      if (value.trim()) url.searchParams.set(name, value.trim());
    }
    return url.href;
  }

  function paint(details, item, state) {
    const form = details.querySelector("form");
    const url = requestUrl(item, form);
    const link = details.querySelector("[data-api-link]");
    link.href = url;
    link.textContent = url;
    const response = state.response;
    details.querySelector("[data-api-status]").textContent = state.controller
      ? "Loading actual response…"
      : response?.status || (item.api.sideEffect ? "No request sent. Use the button to record a roll and see its response." : "Choose parameters and fetch the actual response.");
    details.querySelector("[data-api-response]").textContent = response?.body ?? "No response loaded.";
    const button = form.querySelector("button");
    button.disabled = !!state.controller;
    button.textContent = state.controller ? "Loading…" : item.api.sideEffect
      ? "Roll and load response" : response ? "Refresh response" : "Fetch response";
  }

  function hydrate(container, username) {
    container.querySelectorAll("[data-api-details]").forEach((details) => {
      const item = window.COMMAND_CATALOG.find((entry) => entry.id === details.dataset.apiDetails);
      const state = stateFor(item.id);
      const form = details.querySelector("form");
      for (const parameter of item.api.parameters) {
        form.elements.namedItem(parameter.name).value = state.values[parameter.name]
          ?? (parameter.default || "").replaceAll("{{username}}", username);
      }
      const url = requestUrl(item, form);
      if (state.url !== url) {
        state.controller?.abort();
        state.controller = null;
        state.response = null;
        state.url = url;
      }
      paint(details, item, state);
      details.open = state.open;
    });
  }

  async function load(container, item) {
    const state = stateFor(item.id);
    if (state.controller) return;
    let details = container.querySelector(`[data-api-details="${item.id}"]`);
    const url = requestUrl(item, details.querySelector("form"));
    const controller = new AbortController();
    state.controller = controller;
    state.response = null;
    state.url = url;
    const deadline = setTimeout(() => controller.abort(), 20000);
    paint(details, item, state);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      const body = await response.text();
      let formatted = body;
      let type = "Text";
      try {
        formatted = JSON.stringify(JSON.parse(body), null, 2);
        type = "JSON";
      } catch (_) {
        // Keep non-JSON response bodies intact, including upstream error pages.
      }
      if (state.controller !== controller) return;
      state.response = {
        body: formatted,
        status: `HTTP ${response.status} · ${type} · Fetched ${new Date().toLocaleTimeString()}`,
      };
    } catch (error) {
      if (state.controller !== controller) return;
      state.response = {
        body: "No API response was received.",
        status: controller.signal.aborted
          ? "Request timed out. Try again or open the request URL."
          : `Could not fetch response: ${error.message}. Try again or open the request URL.`,
      };
    } finally {
      clearTimeout(deadline);
      if (state.controller === controller) {
        state.controller = null;
        // Username/record changes may have replaced the card while the fetch was pending.
        details = container.querySelector(`[data-api-details="${item.id}"]`);
        if (details) paint(details, item, state);
      }
    }
  }

  function attach(container) {
    container.addEventListener("toggle", (event) => {
      const details = event.target.closest?.("[data-api-details]");
      if (!details) return;
      const item = window.COMMAND_CATALOG.find((entry) => entry.id === details.dataset.apiDetails);
      const state = stateFor(item.id);
      const wasOpen = state.open;
      state.open = details.open;
      if (details.open && !wasOpen && !state.response && !item.api.sideEffect) load(container, item);
    }, true);
    container.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-api-form]");
      if (!form) return;
      event.preventDefault();
      load(container, window.COMMAND_CATALOG.find((entry) => entry.id === form.dataset.apiForm));
    });
    container.addEventListener("input", (event) => {
      const form = event.target.closest("[data-api-form]");
      if (!form) return;
      const item = window.COMMAND_CATALOG.find((entry) => entry.id === form.dataset.apiForm);
      const state = stateFor(item.id);
      state.values[event.target.name] = event.target.value;
      state.controller?.abort();
      state.controller = null;
      state.response = null;
      state.url = requestUrl(item, form);
      paint(form.closest("details"), item, state);
    });
  }

  return { markup, hydrate, attach };
})();
