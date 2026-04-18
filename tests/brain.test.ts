import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Ola! Sou o assistente da Ecosunpower Energia.' }],
        }),
      };
    },
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue('mock prompt content'),
  };
});

describe('Brain', () => {
  it('should generate a response from Claude', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain('sk-ant-test');

    const response = await brain.processMessage(
      'Ola',
      [],
      'base de conhecimento aqui',
      null,
      'inicio'
    );

    expect(response.text).toContain('Ecosunpower');
    expect(response.displayText).toContain('Ecosunpower');
  });

  it('should parse action from response with JSON block', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain('sk-ant-test');

    const responseText = 'Otimo!\n```json\n{"action":"update_lead","data":{"name":"Joao","city":"Brasilia","profile":"residencial"}}\n```';
    const parsed = brain.parseAction(responseText);

    expect(parsed).not.toBeNull();
    expect(parsed?.action).toBe('update_lead');
    expect(parsed?.data.name).toBe('Joao');
  });

  it('should return null action when no JSON', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain('sk-ant-test');

    const parsed = brain.parseAction('Ola! Como posso ajudar?');
    expect(parsed).toBeNull();
  });

  it('should strip JSON block from display text', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain('sk-ant-test');

    const responseText = 'Otimo, Joao!\n```json\n{"action":"update_lead","data":{"name":"Joao"}}\n```\nPosso continuar?';
    const cleanText = brain.getDisplayText(responseText);

    expect(cleanText).toBe('Otimo, Joao!\n\nPosso continuar?');
    expect(cleanText).not.toContain('json');
  });
});
