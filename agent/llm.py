import os
from getpass import getpass

from langchain_openai import ChatOpenAI


def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    if not os.environ.get("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = getpass("OpenAI API 키를 입력하세요: ")
    return ChatOpenAI(model="gpt-4o-mini", temperature=temperature)
