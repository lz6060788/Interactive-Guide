export const hostStyles = `
:host {
  color-scheme: dark;
}
* {
  box-sizing: border-box;
}
.panorama-host {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #f8fafc;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.panorama-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  --panorama-side-inset: clamp(10px, 3.6%, 16px);
  --panorama-hint-bottom: 12px;
  --panorama-bottom-alignment: calc(clamp(10px, 3.6%, 16px) - 4px);
  --panorama-floating-action-size: 16px;
  border-radius: 10px;
  background: #1d1d1d;
  border: 1px solid rgba(255,255,255,0.08);
}
.panorama-scene-layer {
  position: absolute;
  background-color: #111827;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  will-change: left, top, width, height;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    width 520ms cubic-bezier(0.22, 1, 0.36, 1),
    height 520ms cubic-bezier(0.22, 1, 0.36, 1);
}
.panorama-html-layer {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 0;
  background: #060b14;
}
.panorama-html-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}
.panorama-html-empty {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(255,255,255,0.72);
  font-size: 13px;
  text-align: center;
}
.panorama-blur-mask-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
.panorama-blur-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}
.panorama-blur-scene-layer {
  position: absolute;
  background-color: transparent;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  filter: blur(2px);
  opacity: 0.96;
  will-change: left, top, width, height;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    width 520ms cubic-bezier(0.22, 1, 0.36, 1),
    height 520ms cubic-bezier(0.22, 1, 0.36, 1);
}
.panorama-marker-layer {
  position: absolute;
  background: transparent;
  will-change: left, top, width, height;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    width 520ms cubic-bezier(0.22, 1, 0.36, 1),
    height 520ms cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 4;
}
.panorama-overlay-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.panorama-overlay-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.panorama-section-tabs {
  position: absolute;
  left: clamp(10px, 3.6%, 16px);
  right: clamp(10px, 3.6%, 16px);
  top: clamp(10px, 3.2%, 14px);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 4;
  pointer-events: none;
}
.panorama-section-button,
.panorama-group-button,
.panorama-marker {
  appearance: none;
  border: none;
  font: inherit;
}
.panorama-section-button {
  flex: 1 1 0;
  min-width: 0;
  height: 30px;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.1);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
  color: rgba(255,255,255,0.78);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  cursor: pointer;
  pointer-events: auto;
  text-align: center;
  align-self: stretch;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
  backdrop-filter: blur(8px) saturate(125%);
  -webkit-backdrop-filter: blur(8px) saturate(125%);
}
.panorama-section-button.is-active {
  background: linear-gradient(0deg, rgba(146,146,146,0.1), rgba(146,146,146,0.1)), #ffffff;
  border-color: rgba(255,255,255,0.78);
  color: rgba(0,0,0,0.84);
  font-weight: 500;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.4),
    0 10px 24px rgba(0,0,0,0.14);
}
.panorama-group-tabs {
  position: absolute;
  left: clamp(10px, 3.6%, 16px);
  right: clamp(10px, 3.6%, 16px);
  top: clamp(46px, 13%, 58px);
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
  z-index: 4;
  scrollbar-width: none;
}
.panorama-group-tabs::-webkit-scrollbar {
  display: none;
}
.panorama-group-button {
  background: transparent;
  color: rgba(255,255,255,0.6);
  font-size: 14px;
  line-height: 18px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
.panorama-group-button.is-active {
  color: #ffffff;
  font-weight: 500;
}
.panorama-group-divider {
  width: 1px;
  height: 12px;
  background: rgba(255,255,255,0.2);
  flex: 0 0 auto;
}
.panorama-list {
  position: absolute;
  right: clamp(8px, 3%, 14px);
  top: clamp(88px, 24%, 108px);
  bottom: clamp(42px, 12%, 56px);
  width: clamp(112px, 30%, 138px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 4px 0 0;
  z-index: 4;
  scrollbar-width: none;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.panorama-list::-webkit-scrollbar {
  display: none;
}
.panorama-list.is-dragging {
  cursor: grabbing;
}
.panorama-list-edge-spacer {
  flex: 0 0 auto;
  width: 100%;
  pointer-events: none;
}
.panorama-list-item {
  cursor: pointer;
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.panorama-list-title {
  margin-top: 10px;
  color: rgba(255,255,255,0.6);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
.panorama-list-item.is-active .panorama-list-title {
  color: #ffffff;
  font-weight: 600;
  text-shadow: 0 1px 6px rgba(0,0,0,0.33);
}
.panorama-list-item.is-preview .panorama-list-title {
  color: rgba(255,255,255,0.92);
  font-weight: 600;
  text-shadow: 0 1px 6px rgba(0,0,0,0.33);
}
.panorama-list-body {
  margin-top: 10px;
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  text-shadow: 0 1px 4px rgba(0,0,0,0.32);
}
.panorama-list-item.is-active .panorama-list-body {
  color: rgba(255,255,255,0.92);
  font-weight: 500;
  text-shadow: 0 1px 6px rgba(0,0,0,0.4);
}
.panorama-list-item.is-preview .panorama-list-body {
  color: rgba(255,255,255,0.72);
}
.panorama-list-divider {
  margin-top: 0;
  margin-bottom: 10px;
  width: 100%;
  height: 1px;
  background: rgba(255,255,255,0.84);
  opacity: 0.4;
}
.panorama-list-item.is-active .panorama-list-divider {
  opacity: 0.84;
}
.panorama-list-item.is-preview .panorama-list-divider {
  opacity: 0.72;
}
.panorama-marker {
  position: absolute;
  width: 21px;
  height: 21px;
  border-radius: 999px;
  border: 0.5px solid rgba(255,255,255,0.96);
  background: rgba(255,255,255,0.1);
  cursor: pointer;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: left, top, background, border-color;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    background 220ms ease,
    border-color 220ms ease,
    transform 220ms ease;
}
.panorama-marker-dot {
  width: 9px;
  height: 9px;
  min-width: 9px;
  min-height: 9px;
  flex: 0 0 auto;
  aspect-ratio: 1 / 1;
  display: block;
  border-radius: 999px;
  background: #ffffff;
  transition:
    width 220ms ease,
    height 220ms ease,
    background 220ms ease,
    border 220ms ease;
}
.panorama-marker.is-active {
  border-color: #ff2436;
  background: rgba(255,36,54,0.1);
  transform: scale(1.04);
}
.panorama-marker.is-active .panorama-marker-dot {
  width: 11px;
  height: 11px;
  background: #ff2436;
  border: 1px solid #ffffff;
}
.panorama-hint-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: clamp(28px, 8%, 36px);
  background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%);
  z-index: 4;
}
.panorama-hint-text {
  position: absolute;
  left: var(--panorama-side-inset);
  right: calc(var(--panorama-side-inset) + var(--panorama-floating-action-size) + 12px);
  bottom: var(--panorama-hint-bottom);
  min-height: var(--panorama-floating-action-size);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  text-align: center;
  letter-spacing: 0;
  z-index: 5;
  pointer-events: none;
  padding: 0 4px;
}
.panorama-floating-action {
  position: absolute;
  right: var(--panorama-side-inset);
  bottom: var(--panorama-bottom-alignment);
  width: var(--panorama-floating-action-size);
  height: var(--panorama-floating-action-size);
  padding: 0;
  border: none;
  background: transparent;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 6;
  cursor: pointer;
  opacity: 0.92;
  transition: opacity 180ms ease, transform 180ms ease;
}
.panorama-floating-action:hover {
  opacity: 1;
  transform: scale(1.06);
}
.panorama-floating-action:active {
  transform: scale(0.96);
}
.panorama-floating-action:focus-visible {
  outline: 1px solid rgba(255,255,255,0.62);
  outline-offset: 4px;
  border-radius: 4px;
}
.panorama-floating-action svg {
  display: block;
  width: 11px;
  height: 11px;
}
@media (max-width: 980px) {
  .panorama-list {
    width: 124px;
    top: 104px;
  }
  .panorama-section-tabs {
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .panorama-section-tabs::-webkit-scrollbar {
    display: none;
  }
}
`
