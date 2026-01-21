import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeReviewAgent } from './reviewer';
import type { FileToReview } from './types';

// Mock Anthropic client
const mockAnthropicClient = {
  messages: {
    create: vi.fn(),
  },
};

describe('CodeReviewAgent', () => {
  let agent: CodeReviewAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new CodeReviewAgent(mockAnthropicClient as any);
  });

  describe('reviewFiles', () => {
    it('should analyze files and return structured review', async () => {
      const files: FileToReview[] = [
        {
          filename: 'src/auth.ts',
          content: `
            function login(username, password) {
              const query = "SELECT * FROM users WHERE username='" + username + "'";
              return db.query(query);
            }
          `,
          patch: '@@ -0,0 +1,5 @@\n+function login...',
        },
      ];

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Found critical security vulnerability in authentication code.',
              issues: [
                {
                  type: 'security',
                  severity: 'critical',
                  file: 'src/auth.ts',
                  line: 3,
                  message: 'SQL injection vulnerability detected',
                  suggestion: 'Use parameterized queries instead of string concatenation',
                },
              ],
              verdict: 'request_changes',
            }),
          },
        ],
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await agent.reviewFiles(files, {
        prTitle: 'Add login feature',
        prBody: 'Implements user authentication',
      });

      expect(result.verdict).toBe('request_changes');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('security');
      expect(result.issues[0].severity).toBe('critical');
    });

    it('should approve clean code', async () => {
      const files: FileToReview[] = [
        {
          filename: 'src/utils.ts',
          content: `
            export function formatDate(date: Date): string {
              return date.toISOString().split('T')[0];
            }
          `,
        },
      ];

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Code looks good. Clean utility function with proper typing.',
              issues: [],
              verdict: 'approve',
            }),
          },
        ],
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await agent.reviewFiles(files, {
        prTitle: 'Add date utility',
        prBody: null,
      });

      expect(result.verdict).toBe('approve');
      expect(result.issues).toHaveLength(0);
    });

    it('should detect multiple issues across files', async () => {
      const files: FileToReview[] = [
        {
          filename: 'src/api.ts',
          content: 'var data = any;',
        },
        {
          filename: 'src/db.ts',
          content: 'eval(userInput);',
        },
      ];

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Multiple issues found across files.',
              issues: [
                {
                  type: 'style',
                  severity: 'warning',
                  file: 'src/api.ts',
                  line: 1,
                  message: 'Use const/let instead of var',
                },
                {
                  type: 'security',
                  severity: 'critical',
                  file: 'src/db.ts',
                  line: 1,
                  message: 'Never use eval with user input',
                },
              ],
              verdict: 'request_changes',
            }),
          },
        ],
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await agent.reviewFiles(files, {
        prTitle: 'Various changes',
        prBody: '',
      });

      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((i) => i.file)).toContain('src/api.ts');
      expect(result.issues.map((i) => i.file)).toContain('src/db.ts');
    });

    it('should handle API errors gracefully', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'const x = 1;' }];

      mockAnthropicClient.messages.create.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(agent.reviewFiles(files, { prTitle: 'Test', prBody: null })).rejects.toThrow(
        'API rate limit exceeded'
      );
    });

    it('should include PR context in the review prompt', async () => {
      const files: FileToReview[] = [{ filename: 'fix.ts', content: 'fixed code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'LGTM',
              issues: [],
              verdict: 'approve',
            }),
          },
        ],
      });

      await agent.reviewFiles(files, {
        prTitle: 'Fix critical bug in payment processing',
        prBody: 'This fixes the rounding error in currency conversion',
      });

      // Verify the prompt includes PR context
      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('Fix critical bug');
      expect(callArgs.messages[0].content).toContain('rounding error');
    });

    it('should handle malformed JSON response', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json {{{' }],
      });

      await expect(agent.reviewFiles(files, { prTitle: 'Test', prBody: null })).rejects.toThrow(
        'Failed to parse review response'
      );
    });

    it('should limit file content size to avoid token limits', async () => {
      const largeContent = 'x'.repeat(100000); // 100KB of content
      const files: FileToReview[] = [{ filename: 'large.ts', content: largeContent }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Reviewed truncated content',
              issues: [],
              verdict: 'comment',
            }),
          },
        ],
      });

      await agent.reviewFiles(files, { prTitle: 'Large file', prBody: null });

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      // Content should be truncated
      expect(callArgs.messages[0].content.length).toBeLessThan(largeContent.length);
    });
  });

  describe('getSystemPrompt', () => {
    it('should return a comprehensive code review prompt', () => {
      const prompt = agent.getSystemPrompt();

      expect(prompt).toContain('code review');
      expect(prompt).toContain('security');
      expect(prompt).toContain('anti-pattern');
      expect(prompt).toContain('JSON');
    });
  });

  describe('edge cases', () => {
    it('should handle empty files array', async () => {
      const files: FileToReview[] = [];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'No files to review.',
              issues: [],
              verdict: 'approve',
            }),
          },
        ],
      });

      const result = await agent.reviewFiles(files, {
        prTitle: 'Empty PR',
        prBody: null,
      });

      expect(result.verdict).toBe('approve');
      expect(result.issues).toHaveLength(0);
    });

    it('should handle file with empty content', async () => {
      const files: FileToReview[] = [
        {
          filename: 'empty.ts',
          content: '',
        },
      ];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'File is empty.',
              issues: [],
              verdict: 'comment',
            }),
          },
        ],
      });

      const result = await agent.reviewFiles(files, {
        prTitle: 'Add empty file',
        prBody: null,
      });

      expect(result.verdict).toBe('comment');
    });

    it('should handle file with only whitespace', async () => {
      const files: FileToReview[] = [
        {
          filename: 'whitespace.ts',
          content: '   \n\n\t\t\n   ',
        },
      ];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'File contains only whitespace.',
              issues: [],
              verdict: 'comment',
            }),
          },
        ],
      });

      const result = await agent.reviewFiles(files, {
        prTitle: 'Whitespace file',
        prBody: null,
      });

      expect(result).toBeDefined();
    });

    it('should handle JSON response wrapped in markdown code block', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'const x = 1;' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n{"summary": "LGTM", "issues": [], "verdict": "approve"}\n```',
          },
        ],
      });

      // Implementation extracts JSON from markdown code blocks
      const result = await agent.reviewFiles(files, { prTitle: 'Test', prBody: null });

      expect(result.verdict).toBe('approve');
      expect(result.summary).toBe('LGTM');
    });

    it('should handle response with extra whitespace around JSON', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'const x = 1;' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '  \n  {"summary": "LGTM", "issues": [], "verdict": "approve"}  \n  ',
          },
        ],
      });

      const result = await agent.reviewFiles(files, { prTitle: 'Test', prBody: null });

      expect(result.verdict).toBe('approve');
    });

    it('should handle PR with null body', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'OK',
              issues: [],
              verdict: 'approve',
            }),
          },
        ],
      });

      await agent.reviewFiles(files, { prTitle: 'No description', prBody: null });

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      // Should not crash with null body
      expect(callArgs.messages[0].content).toContain('No description');
    });

    it('should handle PR with empty string body', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'OK',
              issues: [],
              verdict: 'approve',
            }),
          },
        ],
      });

      await agent.reviewFiles(files, { prTitle: 'Test', prBody: '' });

      // Should not crash with empty body
      expect(mockAnthropicClient.messages.create).toHaveBeenCalled();
    });

    it('should handle special characters in PR title and body', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'OK',
              issues: [],
              verdict: 'approve',
            }),
          },
        ],
      });

      await agent.reviewFiles(files, {
        prTitle: 'Fix bug: handle "quotes" & <special> chars',
        prBody: '## Description\n\n- Item 1\n- Item 2\n\n```typescript\nconst x = 1;\n```',
      });

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('quotes');
      expect(callArgs.messages[0].content).toContain('Description');
    });

    it('should handle response with empty content array', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [],
      });

      await expect(agent.reviewFiles(files, { prTitle: 'Test', prBody: null })).rejects.toThrow();
    });

    it('should handle response with non-text content type', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'some_tool',
            input: {},
          },
        ],
      });

      await expect(agent.reviewFiles(files, { prTitle: 'Test', prBody: null })).rejects.toThrow();
    });

    it('should handle issue with line number 0', async () => {
      const files: FileToReview[] = [{ filename: 'test.ts', content: 'code' }];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Issue at line 0',
              issues: [
                {
                  type: 'style',
                  severity: 'info',
                  file: 'test.ts',
                  line: 0,
                  message: 'General comment',
                },
              ],
              verdict: 'comment',
            }),
          },
        ],
      });

      const result = await agent.reviewFiles(files, { prTitle: 'Test', prBody: null });

      expect(result.issues[0].line).toBe(0);
    });

    it('should handle multiple files where total content exceeds limit', async () => {
      // Create files that together exceed the max total content length
      const largeContent = 'x'.repeat(60000); // 60KB each
      const files: FileToReview[] = [
        { filename: 'file1.ts', content: largeContent },
        { filename: 'file2.ts', content: largeContent },
        { filename: 'file3.ts', content: largeContent },
      ];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Reviewed available content',
              issues: [],
              verdict: 'approve',
            }),
          },
        ],
      });

      await agent.reviewFiles(files, { prTitle: 'Large PR', prBody: null });

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      // Should be truncated
      expect(callArgs.messages[0].content.length).toBeLessThan(largeContent.length * 3);
    });
  });
});
