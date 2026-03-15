from dataclasses import dataclass
from typing import List
from enum import Enum

class DocumentType(Enum):
    PDF = "pdf"
    DOCX = "docx"
    TEXT = "text"

@dataclass
class DocumentChunk:
    content: str
    source: str
    page: int
    chunk_index: int

@dataclass
class ParsedDocument:
    original_filename: str
    document_type: DocumentType
    total_pages: int
    chunks: List[DocumentChunk]
    metadata: dict
