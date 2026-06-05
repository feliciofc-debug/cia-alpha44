# OCR — PDF e imagens

A plataforma lê **PDF** e **imagens** (.png, .jpg) via OCR plugável, igual à IA (Claude).

## Opção 1 — OCR.space (recomendado para começar)

1. Crie a API key gratuita: https://ocr.space/ocrapi/freekey.aspx  
2. Na VPS, edite `/etc/cia-alpha44/api.env`:

```env
OCR_PROVIDER=ocrspace
OCR_API_KEY=sua-chave-aqui
OCR_LANGUAGE=chs
```

`OCR_LANGUAGE`: `chs` (chinês), `eng` (inglês), `auto` (detecta).

3. Reinicie a API:

```bash
systemctl restart cia-api
```

4. Teste: `curl -s https://api2.amzofertas.com.br/cia/api/meta`  
   Deve mostrar `"ocrDisponivel": true`.

## Opção 2 — API OCR própria (HTTP)

Se você hospedar seu próprio serviço OCR:

```env
OCR_PROVIDER=http
OCR_API_URL=https://seu-servidor.com/ocr
OCR_API_KEY=token-opcional
OCR_API_HEADER=Authorization
```

Resposta esperada (JSON):

```json
{ "texto": "linha1\tcol2\nlinha2\tcol2" }
```

ou `{ "pages": [{ "texto": "..." }] }`.

## Fluxo

```
PDF/imagem → OCR → texto → parser (mesmas colunas que Excel) → IA → cotação
```

## Limites

- OCR depende da **qualidade** do scan/PDF.
- Tabelas muito complexas podem precisar revisão manual (Fase 1).
- Plano gratuito OCR.space: ~25.000 requisições/mês, 1 MB/arquivo.
