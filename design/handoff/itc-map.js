(function () {
  function whenLeaflet(cb) {
    if (window.L) return cb();
    var n = 0;
    var t = setInterval(function () {
      if (window.L) { clearInterval(t); cb(); }
      else if (++n > 300) { clearInterval(t); }
    }, 50);
  }

  var THEMES = {
    light: { filter: 'saturate(0.18) brightness(1.07) contrast(0.9)', halo: '#FBF8F1', ink: '#1A2020', muted: '#697272', line: '#008F95', panel: 'rgba(251,248,241,0.94)', border: '#DDD6C9' },
    dark:  { filter: 'invert(1) hue-rotate(180deg) saturate(0.2) brightness(0.82) contrast(0.9)', halo: '#1E2422', ink: '#F4F6F6', muted: '#8E9A98', line: '#30A5AB', panel: 'rgba(30,36,34,0.94)', border: '#333B39' }
  };

  class ITCRouteMap extends HTMLElement {
    static get observedAttributes() { return ['pairs-json', 'pairsjson', 'pairs', 'selected', 'theme', 'height']; }

    constructor() {
      super();
      this._pairs = [];
      this._sel = '';
      this._theme = 'light';
      this._h = 460;
    }

    set pairsJson(v) { this._raw = typeof v === 'string' ? v : JSON.stringify(v || []); this._read(); this._paint(); }
    get pairsJson() { return this._raw; }
    set pairs(v) { this.pairsJson = v; }
    set selected(v) { this.setAttribute('selected', v == null ? '' : String(v)); }
    get selected() { return this._sel; }
    set theme(v) { this.setAttribute('theme', v || 'light'); }
    get theme() { return this._theme; }
    set height(v) { this.setAttribute('height', String(v)); }
    get height() { return this._h; }

    attributeChangedCallback() { this._read(); this._paint(); }

    connectedCallback() {
      ['pairsJson', 'pairs', 'selected', 'theme', 'height'].forEach(function (p) {
        if (Object.prototype.hasOwnProperty.call(this, p)) {
          var v = this[p]; delete this[p]; this[p] = v;
        }
      }, this);

      this.style.display = 'block';
      this.style.position = 'relative';
      this._read();

      if (!this._box) {
        this._box = document.createElement('div');
        this._box.style.cssText = 'width:100%;height:' + this._h + 'px;background:transparent';
        this.appendChild(this._box);
        this._legend = document.createElement('div');
        this._legend.style.cssText = 'position:absolute;left:14px;bottom:16px;z-index:500;display:flex;flex-direction:column;gap:7px;padding:11px 13px;border-radius:10px;font:500 12px/1.3 Inter,sans-serif;pointer-events:none';
        this.appendChild(this._legend);
      }

      var self = this;
      whenLeaflet(function () { self._init(); self._paint(); });
    }

    disconnectedCallback() { if (this._map) { this._map.remove(); this._map = null; } }

    _attr(name) {
      var want = name.replace(/-/g, '').toLowerCase();
      for (var i = 0; i < this.attributes.length; i++) {
        var a = this.attributes[i];
        if (a.name.replace(/-/g, '').toLowerCase() === want) return a.value;
      }
      return null;
    }

    _read() {
      var raw = this._attr('pairs-json') || this._attr('pairs') || this._raw;
      if (raw) { try { this._pairs = JSON.parse(raw) || []; } catch (e) { this._pairs = []; } }
      this._sel = this._attr('selected') || '';
      this._theme = this._attr('theme') === 'dark' ? 'dark' : 'light';
      var h = parseInt(this._attr('height'), 10);
      if (h) { this._h = h; if (this._box) this._box.style.height = h + 'px'; }
    }

    _init() {
      if (this._map || !this._box) return;
      var L = window.L;
      this._map = L.map(this._box, {
        zoomControl: true, scrollWheelZoom: false, attributionControl: true, zoomSnap: 0.25
      });
      this._tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 18
      }).addTo(this._map);
      this._layer = L.layerGroup().addTo(this._map);
      this._map.setView([-15.85, -47.95], 10);
      var self = this;
      this._map.on('click', function () { self._map.scrollWheelZoom.enable(); });
      this._map.on('mouseout', function () { self._map.scrollWheelZoom.disable(); });
    }

    _paint() {
      if (!this._map || !window.L) return;
      var L = window.L, t = THEMES[this._theme], self = this;

      var pane = this._map.getPane('tilePane') || this._box.querySelector('.leaflet-tile-pane');
      if (pane) { pane.style.filter = t.filter; pane.style.webkitFilter = t.filter; }
      var ctr = this._box.querySelector('.leaflet-control-attribution');
      if (ctr) ctr.style.cssText = 'background:' + t.panel + ';color:' + t.muted + ';font:400 10px/1.4 Inter,sans-serif';

      this._layer.clearLayers();
      var pts = [];

      this._pairs.forEach(function (p) {
        var sel = !self._sel || self._sel === p.id;
        var o = [p.oLat, p.oLng], d = [p.dLat, p.dLng];
        pts.push(o, d);

        L.polyline([o, d], {
          color: p.cor, weight: sel ? 4 : 2.5, opacity: sel ? 0.95 : 0.5,
          dashArray: sel ? null : '2 7', lineCap: 'round'
        }).addTo(self._layer);

        L.circleMarker(o, {
          radius: sel ? 9 : 7, color: t.halo, weight: 2.5,
          fillColor: p.cor, fillOpacity: sel ? 1 : 0.72
        }).addTo(self._layer).bindTooltip(
          '<strong>' + p.tecnico + '</strong><br>' + p.origemLabel,
          { direction: 'top', offset: [0, -8], className: 'itc-tt' }
        );

        var box = L.divIcon({
          className: '',
          iconSize: null,
          html: '<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px;padding:4px 8px 4px 4px;border-radius:4px;background:' + t.panel + ';border:1px solid ' + (sel ? p.cor : t.border) + ';box-shadow:0 2px 8px rgba(0,0,0,.18);white-space:nowrap;opacity:' + (sel ? 1 : 0.72) + '">' +
                '<span style="width:14px;height:14px;background:' + p.corProjeto + '"></span>' +
                '<span style="font:600 11px/1 Inter,sans-serif;color:' + t.ink + '">' + p.um + '</span>' +
                '<span style="font:500 11px/1 Inter,sans-serif;color:' + t.muted + '">' + p.duracao + '</span>' +
                '</div>'
        });
        L.marker(d, { icon: box, riseOnHover: true }).addTo(self._layer).bindTooltip(
          '<strong>' + p.um + '</strong><br>' + p.destinoLabel,
          { direction: 'top', offset: [0, -14], className: 'itc-tt' }
        );
      });

      this._legend.style.background = t.panel;
      this._legend.style.border = '1px solid ' + t.border;
      this._legend.style.color = t.muted;
      this._legend.innerHTML =
        '<span style="display:flex;align-items:center;gap:8px"><span style="width:11px;height:11px;border-radius:50%;background:' + t.muted + ';border:2px solid ' + t.halo + '"></span>casa do técnico — cor do técnico</span>' +
        '<span style="display:flex;align-items:center;gap:8px"><span style="width:11px;height:11px;background:' + t.muted + '"></span>unidade móvel — cor do projeto</span>';

      if (pts.length) {
        this._map.fitBounds(L.latLngBounds(pts).pad(0.22), { animate: false });
      }
      var m = this._map;
      setTimeout(function () { m.invalidateSize(); }, 60);
    }
  }

  if (!customElements.get('itc-route-map')) customElements.define('itc-route-map', ITCRouteMap);
})();
