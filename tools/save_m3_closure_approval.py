import json

info = js(r"""
(() => {
  // Let's get all chunks
  const turns = Array.from(document.querySelectorAll('.model-prompt-container, ms-prompt-chunk, ms-chat-turn, .chat-turn'));
  const allTextChunks = Array.from(document.querySelectorAll('ms-text-chunk, .rendered-markdown, ms-cmark-node'));
  
  let lastFewTurns = turns.slice(-3).map(t => ({
    className: t.className,
    tagName: t.tagName,
    textLen: t.innerText ? t.innerText.length : 0,
    textSnippet: t.innerText ? t.innerText.slice(0, 300) : ''
  }));

  // Also get the last model response text
  let fullModelText = '';
  if (turns.length > 0) {
    fullModelText = turns[turns.length - 1].innerText || '';
  }

  return {
    turnsCount: turns.length,
    textChunksCount: allTextChunks.length,
    lastFewTurns,
    lastModelTextLen: fullModelText.length,
    lastModelText: fullModelText
  };
})()
""")

print("Turns count:", info.get('turnsCount'))
print("Last model text len:", info.get('lastModelTextLen'))
print("Last few turns:")
for t in info.get('lastFewTurns', []):
    print(" - ", t.get('tagName'), t.get('className'), t.get('textLen'), t.get('textSnippet')[:80].replace('\n', ' '))

last_text = info.get('lastModelText', '')
out_path = 'raw-responses/neon_orchestrator_approval.md'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(last_text)

print(f"Saved {len(last_text)} bytes to {out_path}")
print("\n--- SNIPPET OF RESPONSE ---")
print(last_text[:2000])
