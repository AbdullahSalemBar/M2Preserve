import ast
import json
import os
import time
import warnings
from pathlib import Path
from typing import Dict, List, Literal, Tuple, Union

JSONLike = Union[str, List[Dict]]


HF_MODELS = {
    "Qwen/Qwen3-4B-Instruct-2507",
    "Qwen/Qwen3-4B-Thinking-2507",
    "google/gemma-3-4b-it",
    "microsoft/phi-4",
}
HF_THINKING_MODEL = "Qwen/Qwen3-4B-Thinking-2507"
HF_GEMMA_MODEL = "google/gemma-3-4b-it"


def _parse_llm_json(x):

    if isinstance(x, list):
        return x

    if not isinstance(x, str):
        raise TypeError(f"Expected JSON string or list of dicts, got {type(x)}")

    s = x.strip()
    if not s:
        return []

    candidates = []


    candidates.append(s)


    if s.startswith("```"):
        lines = s.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        candidates.append("\n".join(lines).strip())

    l = s.find("[")
    r = s.rfind("]")
    if l != -1 and r != -1 and r > l:
        candidates.append(s[l:r+1])

    l = s.find("{")
    r = s.rfind("}")
    if l != -1 and r != -1 and r > l:
        obj_text = s[l:r+1]
        candidates.append(obj_text)

    for cand in candidates:
        try:
            data = json.loads(cand)
            if isinstance(data, dict):
                data = [data]
            if isinstance(data, list):
                return data
        except Exception:
            pass

    for cand in candidates:
        try:
            data = ast.literal_eval(cand)
            if isinstance(data, dict):
                data = [data]
            if isinstance(data, list):
                return data
        except Exception:
            pass

    raise ValueError(f"Invalid JSON from LLM after multiple parse attempts.\nRaw output:\n{s[:2000]}")


def _norm(s: str) -> str:
    return str(s or "").strip().lower()

def _is_wrong_kf(op: str) -> bool:
    return _norm(op) == "wrong key fact"

def _is_connected(op: str) -> bool:
    return _norm(op) == "connected"

def _is_good_deletion(op: str) -> bool:
    return _norm(op) == "good deletion"

def _is_elaboration(op: str) -> bool:
    return _norm(op) == "elaboration"

def _validate_operations(items: List[Dict], dimension: str) -> None:

    allowed = (
        {"connected", "good deletion", "bad deletion", "wrong key fact"}
        if dimension == "Completeness"
        else {"connected", "elaboration", "factual error", "wrong key fact"}
    )
    for item in items:
        if not isinstance(item, dict) or _norm(item.get("Operation")) not in allowed:
            raise ValueError(f"Unrecognized {dimension} operation: {item!r}")


def compute_completeness_percentage_score(llm_json: JSONLike) -> Tuple[float, List[int], List[str]]:

    KO = _parse_llm_json(llm_json)
    _validate_operations(KO, "Completeness")

    responses = []
    operations = []

    valid_items = [it for it in KO if not _is_wrong_kf(it.get("Operation"))]

    for it in KO:
        op = it.get("Operation", "")
        responses.append(1 if _is_connected(it.get("Operation")) else 0)
        operations.append(op)

    num = sum(1 for it in valid_items if _is_connected(it.get("Operation")) or _is_good_deletion(it.get("Operation")))

    score = 100.0 * (num / len(valid_items)) if valid_items else 0.0

    return score, responses, operations


def compute_faithfulness_percentage_score(llm_json: JSONLike) -> Tuple[float, List[int], List[str]]:

    KS = _parse_llm_json(llm_json)
    _validate_operations(KS, "Faithfulness")

    responses = []
    operations = []


    valid_items = [it for it in KS if not _is_wrong_kf(it.get("Operation"))]

    for it in KS:
        op = it.get("Operation", "")
        responses.append(1 if _is_connected(it.get("Operation")) else 0)
        operations.append(op)


    num = sum(1 for it in valid_items if _is_connected(it.get("Operation")) or _is_elaboration(it.get("Operation")))
    score = 100.0 * (num / len(valid_items)) if valid_items else 0.0
    return score, responses, operations


class M2Preserve_metric:

    def __init__(
        self,
        prompt: Literal["Faithfulness", "Completeness"],
        model,
        modeltype,
        thinking=False,
        prompt_dir=None,
        verbose=False,
        rate_limit_pause=10,
        max_retries=2,
    ):

        if prompt not in {"Faithfulness", "Completeness"}:
            raise ValueError("prompt must be 'Faithfulness' or 'Completeness'")
        if modeltype not in {"OAI", "OR", "HF"}:
            raise ValueError(f"Unsupported modeltype: {modeltype}")

        if type(max_retries) is not int or max_retries < 0:
            raise ValueError("max_retries must be a non-negative integer")

        if modeltype == "OAI" and thinking is not False:
            allowed_efforts = {"none", "minimal", "low", "medium", "high", "xhigh", "max"}
            if not isinstance(thinking, str) or thinking not in allowed_efforts:
                raise ValueError(
                    "OpenAI thinking must be False or a supported reasoning effort "
                    "string (none, minimal, low, medium, high, xhigh, max)"
                )

        if modeltype == "OR":
            allowed_efforts = {"none", "minimal", "low", "medium", "high", "xhigh", "max"}
            if thinking is not False and thinking is not True:
                if not isinstance(thinking, str) or thinking not in allowed_efforts:
                    raise ValueError(
                        "OpenRouter thinking must be False, True, or a supported reasoning effort string"
                    )

        if modeltype == "HF":
            if not isinstance(model, str) or model not in HF_MODELS:
                raise ValueError(
                    "Unsupported HF model. Choose one of: " + ", ".join(sorted(HF_MODELS))
                )

            if model != HF_THINKING_MODEL and thinking is not False:
                raise ValueError(f"{model} does not support thinking")
            if model == HF_THINKING_MODEL and type(thinking) is not bool:
                raise ValueError(
                    f"{model} always uses thinking; effort levels are not configurable"
                )


        self.prompt = prompt
        self.modeltype = modeltype
        self.thinking = thinking
        self.verbose = verbose
        self.rate_limit_pause = rate_limit_pause
        self.max_retries = max_retries
        self.prompt_dir = Path(prompt_dir) if prompt_dir is not None else Path(__file__).resolve().parent / "prompts"
        self.model = model
        self.hf_model_id = model if modeltype == "HF" else None
        self.tokenizer = None

        if modeltype == "OAI":
            from openai import OpenAI
            self.client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        elif modeltype == "OR":
            from openai import OpenAI
            self.or_client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=os.environ["OPENROUTER_API_KEY"],
            )
        elif modeltype == "HF":
            if model == HF_GEMMA_MODEL:

                from transformers import AutoProcessor, Gemma3ForConditionalGeneration
                self.processor = AutoProcessor.from_pretrained(model)
                self.model = Gemma3ForConditionalGeneration.from_pretrained(
                    model, device_map="auto"
                ).eval()
            else:
                from transformers import AutoModelForCausalLM, AutoTokenizer
                self.tokenizer = AutoTokenizer.from_pretrained(model)
                self.model = AutoModelForCausalLM.from_pretrained(
                    model, torch_dtype="auto", device_map="auto"
                ).eval()

        

    def get_response(self, prompt):
        if self.modeltype == "OAI":
            kwargs = dict(model=self.model, input=prompt)
            if self.thinking is not False:
                kwargs.update(reasoning={"effort": self.thinking}, text={"verbosity": "low"})
            response = self.client.responses.create(**kwargs)
            return response.output_text

        if self.modeltype == "OR":
            kwargs = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
            }

            if self.thinking is True:
                kwargs["extra_body"] = {"reasoning": {"enabled": True}}
            elif self.thinking is not False:
                kwargs["extra_body"] = {"reasoning": {"effort": self.thinking}}
            response = self.or_client.chat.completions.create(**kwargs)
            return response.choices[0].message.content

        if self.modeltype == "HF":
            import torch

            messages = [{"role": "user", "content": prompt}]
            if self.hf_model_id == HF_GEMMA_MODEL:

                messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
                inputs = self.processor.apply_chat_template(
                    messages, add_generation_prompt=True, tokenize=True,
                    return_dict=True, return_tensors="pt"
                ).to(self.model.device)
                with torch.inference_mode():
                    output = self.model.generate(**inputs, max_new_tokens=16384)
                generated = output[0][inputs["input_ids"].shape[-1]:]
                return self.processor.decode(generated, skip_special_tokens=True).strip()

            if self.hf_model_id == HF_THINKING_MODEL:

                formatted = self.tokenizer.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True
                )
                inputs = self.tokenizer([formatted], return_tensors="pt").to(self.model.device)
                with torch.inference_mode():
                    output = self.model.generate(**inputs, max_new_tokens=32768)
                output_ids = output[0][len(inputs.input_ids[0]):].tolist()

                try:
                    index = len(output_ids) - output_ids[::-1].index(151668)
                except ValueError as exc:
                    raise ValueError("Qwen Thinking output has no </think> separator") from exc
                return self.tokenizer.decode(
                    output_ids[index:], skip_special_tokens=True
                ).strip()


            inputs = self.tokenizer.apply_chat_template(
                messages, add_generation_prompt=True, tokenize=True,
                return_dict=True, return_tensors="pt"
            ).to(self.model.device)
            with torch.inference_mode():
                output = self.model.generate(**inputs, max_new_tokens=16384)
            generated = output[0][inputs["input_ids"].shape[-1]:]
            return self.tokenizer.decode(generated, skip_special_tokens=True).strip()

        raise ValueError(f"Unsupported modeltype: {self.modeltype}")

    def get_prompt(self, complex, simplified, keyfacts=""):

        if self.prompt == 'Completeness':


            complex = " ".join(complex) if isinstance(complex, (list, tuple)) else complex.replace("\n", " ")
            simplified = simplified.split("\n") if isinstance(simplified, str) else simplified

            simplified = ['[' + str(line_num + 1) + '] ' + sentence for line_num, sentence in enumerate(simplified)]
            simplified = '\n'.join(simplified)
            num_key_facts = str(len(keyfacts))
            keyfacts = '\n'.join(keyfacts)

            prompt = (self.prompt_dir / f"M2Preserve_{self.prompt}.txt").read_text(encoding="utf-8").strip()
            prompt = prompt % (complex, num_key_facts, keyfacts, simplified)


        elif self.prompt == 'Faithfulness':

            simplified = " ".join(simplified) if isinstance(simplified, (list, tuple)) else simplified.replace("\n", " ")
            complex = complex.split("\n") if isinstance(complex, str) else complex

            complex = ['[' + str(line_num + 1) + '] ' + sentence for line_num, sentence in enumerate(complex)]
            complex = '\n'.join(complex)
            num_key_facts = str(len(keyfacts))
            keyfacts = '\n'.join(keyfacts)

            prompt = (self.prompt_dir / f"M2Preserve_{self.prompt}.txt").read_text(encoding="utf-8").strip()
            prompt = prompt % (simplified, num_key_facts, keyfacts, complex)


        else:
            raise ValueError(f"Unsupported prompt: {self.prompt}")

        return prompt



    def compute_metric(self, complex, simplified, keyfacts):

        if not (len(complex) == len(simplified) == len(keyfacts)):
            raise ValueError("complex, simplified, and keyfacts must have the same number of instances")
        for facts in keyfacts:
            if not isinstance(facts, (list, tuple)):
                raise TypeError("Each keyfacts entry must be a list of extracted key-fact strings")
            if not all(isinstance(fact, str) and fact.strip() for fact in facts):
                raise ValueError("Each key fact must be a non-empty string")

        scores = []
        all_responses = []
        all_operations = []

        for index, (complex_single, simp_single, keyfacts_single) in enumerate(zip(complex, simplified, keyfacts)):
            prompt = self.get_prompt(complex_single, simp_single, keyfacts_single)
            if self.verbose:
                print(f"Instance {index + 1}/{len(complex)}: {self.prompt}")

            if self.modeltype in {'OAI', 'OR'}:
                if index % 5 == 0 and index != 0:
                    time.sleep(self.rate_limit_pause)

            last_err = None
            for attempt in range(self.max_retries + 1):
                try:
                    raw_output = self.get_response(prompt)
                    items = _parse_llm_json(raw_output)
                    if len(items) != len(keyfacts_single):
                        raise ValueError(f"Expected {len(keyfacts_single)} labels, got {len(items)}")

                    if self.prompt == "Completeness":
                        score, resps, ops = compute_completeness_percentage_score(items)
                    else:
                        score, resps, ops = compute_faithfulness_percentage_score(items)
                    if self.verbose:
                        print(f"Score: {score:.2f}")
                    break
                except Exception as exc:
                    status = getattr(exc, "status_code", None)
                    if (
                        self.modeltype in {"OAI", "OR"}
                        and isinstance(status, int)
                        and 400 <= status < 500
                        and status not in {408, 409, 425, 429}
                    ):
                        raise
                    if isinstance(exc, (ImportError, MemoryError)):
                        raise
                    last_err = exc
                    if self.verbose:
                        print(f"Attempt {attempt + 1}/{self.max_retries + 1} failed: {exc}")
                    if attempt < self.max_retries:
                        time.sleep(2)
            else:
                warnings.warn(
                    f"M2Preserve: instance {index + 1}/{len(complex)} failed after "
                    f"{self.max_retries + 1} attempts ({last_err}); Score is None.",
                    RuntimeWarning,
                    stacklevel=2,
                )
                scores.append(None)
                all_responses.append([])
                all_operations.append([])
                continue

            scores.append(float(score))
            all_responses.append(resps)
            all_operations.append(ops)


        return scores, all_responses, all_operations
