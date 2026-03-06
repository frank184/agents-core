/**
 * Prompt templates for documentation generation
 * These work with Claude via Copilot SDK and benefit from available skills
 */

export const SYSTEM_MESSAGES = {
  documentationExpert: `You are a technical documentation expert with access to skills for markdown conversion and documentation structure. Your role is to transform raw content into professional, well-structured markdown documentation. Always:
- Use clear, concise language
- Include practical examples
- Structure content logically
- Follow markdown best practices
- Ensure consistency throughout`,

  codeDocumentalist: `You are an expert code documentation specialist. Generate clear, comprehensive documentation for code. Include:
- Purpose and overview
- Parameters and return values
- Usage examples
- Related functions
- Best practices`,

  releaseNotesWriter: `You are a professional release notes writer. Create compelling release notes that:
- Highlight key improvements
- Explain breaking changes clearly
- Provide migration guidance
- Use engaging language
- Follow semantic versioning context`,
};

export const PROMPTS = {
  /**
   * From document chunks to structured documentation
   */
  documentSummarization: (content: string, projectName: string): string => `
Transform the following document content into comprehensive, professional markdown documentation.

PROJECT: ${projectName}

CONTENT TO ANALYZE:
${content}

Generate documentation that includes:
1. **Overview** - 2-3 sentence summary
2. **Key Features** - Bullet list of main capabilities
3. **Getting Started** - Step-by-step setup instructions
4. **Architecture** - System design overview
5. **Usage Examples** - Practical code examples
6. **API Reference** - Available functions/endpoints
7. **Contributing** - Guidelines for contributors

Requirements:
- Format as valid Markdown
- Use clear headings and sections
- Include code examples where relevant
- Ensure consistency in formatting
- Make it accessible to different skill levels

IMPORTANT: Return ONLY the markdown documentation, no explanations or meta-commentary.
`,

  /**
   * Enhance existing documentation
   */
  documentEnhancement: (title: string, content: string): string => `
Enhance this documentation section to be more professional and comprehensive.

SECTION TITLE: ${title}

CURRENT CONTENT:
${content}

Improve by:
1. Clarifying ambiguous sections
2. Adding relevant, practical examples
3. Improving markdown formatting
4. Including best practices and warnings
5. Ensuring technical accuracy
6. Making it more discoverable with better headings

IMPORTANT: Return ONLY the enhanced markdown documentation.
`,

  /**
   * Document PDF/DOCX file content
   */
  parseAndDocument: (
    fileName: string,
    extractedText: string,
    fileType: string
  ): string => `
A ${fileType} file named "${fileName}" has been uploaded. Here's the extracted content:

${extractedText}

Create professional, well-structured markdown documentation from this content. Include:
1. Relevant sections based on the content
2. Clear organization and structure
3. Practical examples where applicable
4. Proper markdown formatting

Treat this as a standalone documentation piece.
`,

  /**
   * Code documentation generation
   */
  codeDocumentation: (code: string, language: string, context?: string): string => `
Generate comprehensive documentation for this ${language} code:

\`\`\`${language}
${code}
\`\`\`

${context ? `Context: ${context}` : ""}

Include:
1. Function/Class overview and purpose
2. Parameters with types and descriptions
3. Return values and types
4. Usage examples
5. Error handling considerations
6. Related functions or classes

Format as Markdown with code examples.
`,

  /**
   * Release notes generation
   */
  releaseNotes: (version: string, changes: string[]): string => `
Create professional release notes for version ${version}.

CHANGES:
${changes.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Structure the release notes with:
1. **Version**: ${version} with date
2. **Overview**: Summary of this release
3. **New Features**: Highlighted additions
4. **Improvements**: Performance and usability enhancements
5. **Bug Fixes**: Issues resolved
6. **Breaking Changes**: Any incompatibilities (if applicable)
7. **Migration Guide**: Steps for users to upgrade (if needed)

Use clear Markdown formatting with proper sections.
`,

  /**
   * API documentation
   */
  apiDocumentation: (
    endpoints: string[],
    baseUrl: string,
    context?: string
  ): string => `
Generate comprehensive API documentation.

BASE URL: ${baseUrl}

ENDPOINTS TO DOCUMENT:
${endpoints.join("\n")}

${context ? `ADDITIONAL CONTEXT:\n${context}` : ""}

Create documentation that includes:
1. **Overview** - API purpose and version
2. **Authentication** - How to authenticate
3. **Endpoints** - For each endpoint:
   - Method and path
   - Description
   - Request parameters/body
   - Response format
   - Example curl commands
4. **Errors** - Common error codes and meanings
5. **Rate Limiting** - If applicable
6. **Best Practices** - Usage recommendations

Format as Markdown with code blocks for examples.
`,

  /**
   * Architecture documentation
   */
  architectureDocumentation: (
    description: string,
    components: string[]
  ): string => `
Generate architecture documentation.

SYSTEM DESCRIPTION:
${description}

KEY COMPONENTS:
${components.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Create documentation including:
1. **Overview** - System purpose and design goals
2. **Architecture Diagram** (as ASCII art or description)
3. **Components** - Detailed description of each
4. **Data Flow** - How data moves through the system
5. **Interfaces** - How components communicate
6. **Scalability** - How the system scales
7. **Deployment** - Deployment considerations

Format as Markdown with clear sections and examples.
`,
};
