import sys
import json
from pathlib import Path
from .parser import DocumentParser
from .types import ParsedDocument

def serialize_parsed_doc(doc: ParsedDocument) -> dict:
    """Convert ParsedDocument to JSON-serializable dict"""
    return {
        'original_filename': doc.original_filename,
        'document_type': doc.document_type.value,
        'total_pages': doc.total_pages,
        'chunk_count': len(doc.chunks),
        'chunks': [
            {
                'content': chunk.content,
                'source': chunk.source,
                'page': chunk.page,
                'chunk_index': chunk.chunk_index
            }
            for chunk in doc.chunks
        ],
        'metadata': doc.metadata
    }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python main.py <file_path>", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        parsed = DocumentParser.parse_file(file_path)
        result = serialize_parsed_doc(parsed)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)
