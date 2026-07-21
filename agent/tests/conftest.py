def pytest_configure(config):
    config.addinivalue_line("markers", "llm: marks tests that call a real LLM API (deselect with '-m \"not llm\"')")
