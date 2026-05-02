export const executionTools = [
  {
    name: 'run_command',
    description: 'Run a shell command in the project workspace.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 file from workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write UTF-8 content to a file in workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  }
] as const;
