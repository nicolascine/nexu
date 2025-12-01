#!/usr/bin/env python3
"""
BGE Reranker script for nexu.
Uses BAAI/bge-reranker-v2-m3 for fast, accurate reranking.

Usage:
  echo '{"query": "...", "passages": ["...", "..."]}' | python scripts/rerank.py

Returns:
  JSON array of scores (0-1) for each passage
"""

import sys
import json

def main():
    try:
        from FlagEmbedding import FlagReranker
    except ImportError:
        print("Error: FlagEmbedding not installed. Run: pip install FlagEmbedding", file=sys.stderr)
        sys.exit(1)

    # Read input from stdin
    input_data = json.load(sys.stdin)
    query = input_data['query']
    passages = input_data['passages']

    if not passages:
        print(json.dumps([]))
        return

    # Initialize reranker (cached after first load)
    reranker = FlagReranker('BAAI/bge-reranker-v2-m3', use_fp16=True)

    # Create query-passage pairs
    pairs = [[query, passage] for passage in passages]

    # Get normalized scores (0-1)
    scores = reranker.compute_score(pairs, normalize=True)

    # Handle single passage case (returns float instead of list)
    if isinstance(scores, float):
        scores = [scores]

    print(json.dumps(scores))

if __name__ == '__main__':
    main()
