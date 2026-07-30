import { useEffect, useMemo, useState } from "react";
import { api, type TenantBranding } from "./lib/api.ts";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

function logoPreviewUrl(branding: TenantBranding | null): string | null {
  if (!branding?.logoUrl) return null;
  const version = branding.brandingAtualizadoEm ? encodeURIComponent(branding.brandingAtualizadoEm) : Date.now();
  return `${branding.logoUrl}?v=${version}`;
}

export function TenantBrandingView({
  branding,
  onBrandingChange,
}: {
  branding: TenantBranding | null;
  onBrandingChange: (branding: TenantBranding) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoUrl = useMemo(() => logoPreviewUrl(branding), [branding]);

  useEffect(() => {
    setDisplayName(branding?.hasTenantBranding ? branding.displayName : "");
    setTagline(branding?.tagline ?? "");
  }, [branding]);

  async function salvarTexto() {
    setErro("");
    setSucesso("");
    setSalvando(true);
    try {
      const atualizado = await api.atualizarTenantBranding({
        displayName: displayName.trim() || null,
        tagline: tagline.trim() || null,
      });
      onBrandingChange(atualizado);
      setSucesso("Marca atualizada.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar marca.");
    } finally {
      setSalvando(false);
    }
  }

  async function uploadLogo(file?: File | null) {
    if (!file) return;
    setErro("");
    setSucesso("");
    if (!LOGO_MIMES.has(file.type)) {
      setErro("Envie uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setErro("Logo excede 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const atualizado = await api.uploadTenantLogo(file);
      onBrandingChange(atualizado);
      setSucesso("Logo atualizada.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar logo.");
    } finally {
      setUploading(false);
    }
  }

  async function removerLogo() {
    setErro("");
    setSucesso("");
    setUploading(true);
    try {
      const atualizado = await api.removerTenantLogo();
      onBrandingChange(atualizado);
      setSucesso("Logo removida.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao remover logo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-300">White-label</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Minha marca</h1>
        <p className="mt-2 text-sm text-slate-400">
          Configure o nome e a logo que aparecem no menu e nas invoices da sua conta.
        </p>
      </div>

      <div className="card space-y-5 p-6">
        {erro && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{erro}</div>}
        {sucesso && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
            {sucesso}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div className="rounded-xl border border-white/10 bg-ink-950/60 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Preview</p>
            <div className="flex h-28 items-center justify-center rounded-lg bg-ink-900/80 p-4">
              {logoUrl ? (
                <img src={logoUrl} alt={branding?.displayName || "Logo"} className="max-h-20 max-w-full object-contain" />
              ) : (
                <span className="text-center text-sm text-slate-500">Sem logo configurada</span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="label">Nome exibido</span>
              <input
                className="input"
                value={displayName}
                maxLength={80}
                placeholder="Ex.: comexia"
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Subtítulo</span>
              <input
                className="input"
                value={tagline}
                maxLength={120}
                placeholder="Ex.: Cotação de importação inteligente"
                onChange={(e) => setTagline(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" disabled={salvando} onClick={() => void salvarTexto()}>
                {salvando ? "Salvando..." : "Salvar textos"}
              </button>
              <label className="btn-ghost cursor-pointer">
                {uploading ? "Enviando..." : "Enviar logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => void uploadLogo(e.target.files?.[0])}
                />
              </label>
              {branding?.logoUrl ? (
                <button type="button" className="btn-ghost text-red-300" disabled={uploading} onClick={() => void removerLogo()}>
                  Remover logo
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">Formatos aceitos: PNG, JPEG ou WebP. Tamanho máximo: 2 MB.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
