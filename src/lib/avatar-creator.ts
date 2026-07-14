/**
 * Thin client wrapper for three.ws Avatar Studio iframe export.
 * Vendored from @three-ws/avatar/creator — no npm dependency required.
 */

const DEFAULT_STUDIO_URL = "https://three.ws/create/studio";

export class AvatarCreator {
  private container: HTMLElement | null;
  private studioUrl: string;
  private onExport: ((blob: Blob) => void) | null;
  private onClose: (() => void) | null;
  private modal: HTMLDivElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private onMessage: ((e: MessageEvent) => void) | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(opts: {
    container?: HTMLElement;
    studioUrl?: string;
    onExport?: (blob: Blob) => void;
    onClose?: () => void;
  } = {}) {
    this.container = opts.container ?? (typeof document !== "undefined" ? document.body : null);
    this.studioUrl = (opts.studioUrl ?? DEFAULT_STUDIO_URL).replace(/\/$/, "");
    this.onExport = opts.onExport ?? null;
    this.onClose = opts.onClose ?? null;
  }

  open() {
    if (this.modal || !this.container) return;
    this.buildModal();
    this.onMessage = (e) => this.handleMessage(e);
    window.addEventListener("message", this.onMessage);
    if (this.iframe) this.iframe.src = this.studioUrl;
  }

  close() {
    if (this.onMessage) {
      window.removeEventListener("message", this.onMessage);
      this.onMessage = null;
    }
    if (this.onKeyDown) {
      document.removeEventListener("keydown", this.onKeyDown);
      this.onKeyDown = null;
    }
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
      this.iframe = null;
      this.onClose?.();
    }
  }

  private buildModal() {
    const modal = document.createElement("div");
    modal.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center";
    const card = document.createElement("div");
    card.style.cssText =
      "background:#111;border-radius:12px;width:min(960px,96vw);height:min(720px,92vh);position:relative;overflow:hidden;border:1px solid rgba(255,255,255,0.1)";
    const iframe = document.createElement("iframe");
    iframe.title = "three.ws Avatar Studio";
    iframe.allow = "camera *; microphone *; clipboard-write";
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block";
    card.appendChild(iframe);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.style.cssText =
      "position:absolute;top:8px;right:10px;z-index:1;background:rgba(0,0,0,0.5);color:#fff;border:0;width:32px;height:32px;border-radius:50%;font-size:20px;cursor:pointer";
    closeBtn.addEventListener("click", () => this.close());
    card.appendChild(closeBtn);
    modal.appendChild(card);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.close();
    });
    this.onKeyDown = (e) => {
      if (e.key === "Escape") this.close();
    };
    document.addEventListener("keydown", this.onKeyDown);
    this.container!.appendChild(modal);
    this.modal = modal;
    this.iframe = iframe;
  }

  private handleMessage(event: MessageEvent) {
    const msg = event.data;
    if (!msg || typeof msg !== "object" || !this.iframe) return;
    try {
      const expected = new URL(this.iframe.src).origin;
      if (event.origin !== expected) return;
    } catch {
      return;
    }
    if (msg.source === "characterstudio" && msg.type === "export" && msg.glb instanceof ArrayBuffer) {
      this.onExport?.(new Blob([msg.glb], { type: "model/gltf-binary" }));
      this.close();
    }
  }
}
