import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenRouterGateway } from './openrouter.gateway';

describe('OpenRouterGateway', () => {
  const buildConfig = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  const inputMessages = [{ role: 'user' as const, content: 'Hi' }];

  afterEach(() => jest.restoreAllMocks());

  it('is disabled without a key and refuses to call out', async () => {
    // Arrange
    const mockFetch = jest.spyOn(global, 'fetch');
    const gateway = new OpenRouterGateway(buildConfig({}));

    // Act
    const actual = gateway.chat({ messages: inputMessages, maxTokens: 10 });

    // Assert
    expect(gateway.isEnabled).toBe(false);
    await expect(actual).rejects.toThrow(ServiceUnavailableException);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends the configured model and returns the reply text', async () => {
    const mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: ' Hello ' } }] })),
      );
    const gateway = new OpenRouterGateway(
      buildConfig({ OPENROUTER_API_KEY: 'key', OPENROUTER_MODEL: 'anthropic/claude-opus-5.5' }),
    );

    const actualReply = await gateway.chat({ messages: inputMessages, maxTokens: 10 });

    expect(actualReply).toBe('Hello');
    const sentBody = JSON.parse(String(mockFetch.mock.calls[0][1]?.body));
    expect(sentBody).toMatchObject({
      model: 'anthropic/claude-opus-5.5',
      max_tokens: 10,
      reasoning: { effort: 'low', exclude: true },
    });
  });

  it('defaults to Claude Sonnet 5.5', () => {
    const gateway = new OpenRouterGateway(buildConfig({ OPENROUTER_API_KEY: 'key' }));

    expect(gateway.model).toBe('anthropic/claude-sonnet-5.5');
  });

  it('turns an upstream error into a 503 without leaking its body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Insufficient credits', code: 402 } }), {
        status: 402,
      }),
    );
    const gateway = new OpenRouterGateway(buildConfig({ OPENROUTER_API_KEY: 'key' }));

    const actual = gateway.chat({ messages: inputMessages, maxTokens: 10 });

    await expect(actual).rejects.toThrow('The clinical assistant could not answer. Try again.');
  });
});
