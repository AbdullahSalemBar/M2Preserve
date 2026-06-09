<h1 align="center">M<sup>2</sup>PRESERVE</h1>

<p align="center">
  A multidimensional framework for evaluating meaning preservation in text simplification.
</p>

<p align="center">
 <a href="#m2preserve-annotation-interface">Annotation Interface</a> | <a href="#m2preserveeval-dataset">Dataset</a> | <a href="#paper">Paper</a>
</p>

<p align="center">
  <img src="m2preserve-framework.png" alt="M2PRESERVE framework overview" width="900">
</p>



---

## M<sup>2</sup>PRESERVE Annotation Interface


---

## M<sup>2</sup>PreserveEval Dataset
The M<sup>2</sup>PreserveEval dataset will be hosted on Hugging Face:

```text
https://huggingface.co/datasets/cardiffnlp/M2PreserveEval
```
The dataset contains instance-level annotations for evaluating **meaning preservation in text simplification** using the M<sup>2</sup>Preserve framework. Each instance includes an original text, a simplified output, extracted key facts, alignment decisions, fine-grained annotation labels, and a final score.

The dataset is organised into two JSONL files:

```text
M2PreserveEval_Completeness.jsonl
M2PreserveEval_faithfulness.jsonl
```

Each JSONL line represents one annotated instance.

### Dataset Format

Each instance follows this structure:

```json
{
  "dimension": "completeness",
  "instanceidx": 0,
  "sourceName": "TSAR 2025 Shared Task on RCTS (British Council)",
  "source": "...",
  "simplified": "...",
  "keyFacts": ["..."],
  "System_Name": "gemini-2.0-flash",
  "score": 100,
  "Alignment": [1, 1, 1],
  "Labels": ["Connected", "Connected", "Connected"]
}
```

### Fields

| Field | Description |
|---|---|
| `dimension` | Evaluation dimension, either `completeness` or `faithfulness`. |
| `instanceidx` | Instance index. |
| `sourceName` | Name of the source dataset from which the original text was sampled. |
| `source` | Original input text. |
| `simplified` | Simplified text. |
| `keyFacts` | Atomic key facts extracted from the text. In completeness, they are extracted from the original text; in faithfulness, they are extracted from the simplified text. |
| `System_Name` | Name of the simplification model. |
| `score` | Final score for the evaluated dimension. |
| `Alignment` | Binary alignment values for the key facts. |
| `Labels` | Fine-grained labels for each key fact. Completeness labels include `Connected`, `good deletion`, `bad deletion`, and `Wrong Key Fact`; faithfulness labels include `Connected`, `elaboration`, `factual error`, and `Wrong Key Fact`. |

## Source Datasets

The instances are sampled from the following sources:

- [`cambridge_exams_en`](https://huggingface.co/datasets/UniversalCEFR/cambridge_exams_en)
- [`elg_cefr_en`](https://huggingface.co/datasets/UniversalCEFR/elg_cefr_en)
- [`OneStopEnglish corpus`](https://github.com/nishkalavallabhi/OneStopEnglishCorpus)
- [`TSAR 2025 Shared Task on RCTS (British Council)`](https://huggingface.co/collections/cardiffnlp/tsar-2025-shared-task-on-rcts)

