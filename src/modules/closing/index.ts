// src/modules/closing/index.ts
export * from './types.js';
export {
  findMissingRequired,
  isValidCPF,
  isValidCNPJ,
  isValidCEP,
  isValidEmail,
  isValidPhoneBR,
  formatCPF,
  formatCNPJ,
  formatCEP,
  formatPhoneBR,
} from './closing-validator.js';
export {
  fetchByLeadId,
  searchLeadByName,
  buildInitialData,
  type LeadRow,
  type PropostaPublicaRow,
  type FetchResult,
} from './closing-data-fetcher.js';
export { renderContrato, buildObservacaoPartes } from './templates/contrato.html.js';
export { renderProcuracao } from './templates/procuracao.html.js';
export { renderHtmlToPdf, shutdownPdfRenderer } from './closing-render.js';
export {
  ClosingDriveUploader,
  type UploadFechamentoInput,
  type UploadFechamentoResult,
} from './closing-drive.js';
export {
  ClosingPersist,
  type CreateFechamentoInput,
  type UpdateDriveLinksInput,
} from './closing-persist.js';
export {
  ClosingAssistant,
  createAnthropicLlmCaller,
  type LlmCaller,
  type LlmResponse,
  type ClosingAssistantOpts,
  type ProcessResult,
} from './closing-assistant.js';
