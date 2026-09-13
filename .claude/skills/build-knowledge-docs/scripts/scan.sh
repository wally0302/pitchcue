#!/usr/bin/env bash
# 禁句掃描：命中只允許出現在 00 的「不要說」欄、問題句、或「不要說」段落。
# 用法：bash scan.sh [額外 regex]
cd "$(dirname "$0")/../../../.." || exit 1
PAT='Object Lock 已|EventBridge 增量|1,000 個|Nova|3\.5 Sonnet|1,?310|1,?122|66 條|78%|準確率(達|有|約)? ?[0-9]|召回率 ?[0-9]|Recall@5 達|Cognito 已|Guardrails? 已|已有承辦人|每件 (NT|US|[0-9])'
[ -n "$1" ] && PAT="$PAT|$1"
echo "== hits outside data/00-* =="
grep -n -E "$PAT" data/0[1-9]*.md | grep -v -E '不要說|不要報|那是錯的|撤回|^[^:]*:[0-9]+:- .*？$' || echo "(none)"
echo "== char count =="
wc -m data/0*.md | tail -1
