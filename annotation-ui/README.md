# M2Preserve Annotation UI

This folder contains the React/Vite annotation interface for M<sup>2</sup>PRESERVE.

## Run locally

```bash
npm install
npm run dev
```

## Build locally

```bash
npm run build
npm run preview
```

## Input JSON format

The app expects a JSON file containing an `instances` array:

```json
{
  "instances": [
    {
      "id": "m2p_001",
      "idx": 1,
      "SystemName": "ExampleSystem",
      "orginal": "Original text here.",
      "simplified": "[1] Simplified text here.",
      "source": "example",
      "displayType": "simplified",
      "keyFacts": ["A key fact."]
    }
  ]
}
```

The app also supports re-uploading downloaded annotation files to resume work.
