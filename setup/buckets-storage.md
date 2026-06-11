# Buckets de Storage — EcoSof Kit Clone

## Como criar

No Supabase Dashboard do novo projeto: **Storage → New bucket**

Os buckets marcados como criados pelas migrations já são criados automaticamente
pelo `instalador-banco-ecosof.sql`. Os demais precisam ser criados manualmente.

---

## Lista completa de buckets

| Bucket | Acesso | Criado por | Usado em |
|--------|--------|------------|----------|
| `marketing-images` | **Público** | migration 004 | Posts de marketing (imagens geradas por IA/Higgsfield) |
| `marketing-videos` | **Público** | migration 006 | Posts de marketing (vídeos gerados por IA/Higgsfield) |
| `ad-creatives` | **Público** | Manual | Criativos de anúncios Meta (imagens + banners `/banner`) |
| `client-attachments` | **Privado** | Manual | Anexos de leads (contas de luz, fotos, áudios via WhatsApp) |
| `estudos-personalizados` | **Privado** | Manual | Fotos e vídeos de proposta personalizada (3 fotos + 1 vídeo por proposta) |
| `cases-videos` | **Público** | Manual | Vídeos dos cases de sucesso (depoimentos em vídeo do site) |
| `financeiro-comprovantes` | **Privado** | Manual | Comprovantes fiscais/financeiros enviados via WhatsApp |

---

## Passos de criação manual (Storage Dashboard)

### Buckets Públicos
`ad-creatives`, `cases-videos`

1. New bucket → nome conforme tabela
2. Marcar **Public bucket** ✓
3. Salvar

### Buckets Privados
`client-attachments`, `estudos-personalizados`, `financeiro-comprovantes`

1. New bucket → nome conforme tabela
2. **NÃO** marcar Public bucket
3. Salvar
4. O backend usa `createSignedUrls()` com TTL para gerar links temporários

---

## Observações

- `marketing-images` e `marketing-videos` são criados pelo SQL do instalador
  (statements `insert into storage.buckets` nas migrations 004 e 006).
- Todos os uploads/downloads passam pelo service role key no backend —
  não é necessário configurar políticas RLS de acesso granular.
- O bucket `estudos-personalizados` guarda as fotos do estudo personalizado
  com link assinado de 1h regenerado a cada acesso da proposta pública.
