# INSTALL — Amazon Linux 2023 (AWS EC2) 데모 서버 설치

**대상**: 빈 Amazon Linux 2023 인스턴스에 이 리포를 올려 **시연용 대시보드**를 띄우는 것.
설계 배경·의사결정은 `docs/superpowers/plans/2026-08-04-aws-ec2-demo-deploy.md`에 있다.
화면 사용법은 `docs/실행가이드_backend-agent.md`.

> **개발 PC(Windows)에서 그냥 돌리고 싶다면** 이 문서가 아니라
> `handoff/NEXT.md`의 "새 PC에서 이어받을 때" 절차(`py -3 -m backend.demo`)를 보면 된다.

**전제**
- 인스턴스: `c7i.2xlarge`(8 vCPU / 16GB) 권장, gp3 40GB — *`t3`류는 CPU 크레딧을 소진하면
  시연 중반부터 스로틀된다.*
- 보안그룹 인바운드: **`22`·`80`만, 내 IP/32에만**. `8000`(앱)·`11434`(Ollama)는 **열지 않는다**
  — 둘 다 `127.0.0.1`에만 바인딩되고 nginx가 앞에 선다.

---

## 1단계 — 런타임 한 방 설치

```bash
sudo dnf update -y
sudo timedatectl set-timezone Asia/Seoul     # 시연 화면의 날짜/로그를 한국 시각으로

# 파이썬 3.11 + 빌드도구 + 웹서버 + htpasswd(=httpd-tools) + git
sudo dnf install -y \
    python3.11 python3.11-pip python3.11-devel \
    gcc git nginx httpd-tools tar

# LLM 런타임 (systemd 서비스로 등록되고 127.0.0.1:11434 에만 바인딩된다)
curl -fsSL https://ollama.com/install.sh | sh
```

> ⚠️ **`python3`(3.9)를 쓰면 안 된다.** Amazon Linux 2023의 기본 `python3`는 3.9인데,
> 이 코드는 `str | None` 같은 표기를 **런타임에** 평가하는 pydantic 모델을 쓰므로
> **3.10 이상**이 필요하다. 아래 절차는 전부 `python3.11`을 명시한다.

---

## 2단계 — 리포 + 파이썬 의존성

```bash
sudo mkdir -p /opt && sudo chown "$USER":"$USER" /opt
git clone https://github.com/ukiKwon/GGReportAgent.git /opt/GGReportAgent
cd /opt/GGReportAgent

python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt      # fastapi·uvicorn·langgraph·numpy·python-pptx 등 전부
```

`requirements.txt` 하나로 끝난다 — 별도로 설치할 파이썬 패키지는 없다.

> **private 리포라면** 위 `git clone`이 아이디/비밀번호를 묻고 실패한다(GitHub는 비밀번호
> 인증을 막았다). 둘 중 하나를 쓴다.
> - **PAT**: GitHub → Settings → Developer settings → Personal access tokens에서 `repo`
>   읽기 권한 토큰을 만들고
>   `git clone https://<토큰>@github.com/ukiKwon/GGReportAgent.git /opt/GGReportAgent`
> - **Deploy key**(더 안전, 이 리포에만 유효): EC2에서 `ssh-keygen -t ed25519` →
>   공개키를 리포 Settings → Deploy keys에 등록 →
>   `git clone git@github.com:ukiKwon/GGReportAgent.git /opt/GGReportAgent`

### 설치 확인 (여기서 걸러야 나중에 안 헤맨다)

```bash
python -c "import fastapi, uvicorn, langgraph, numpy, pptx, pypdf; print('deps OK')"

# FTS5 trigram 토크나이저는 SQLite 3.34+ 에서만 된다 (검색 인덱스가 이걸 쓴다)
python - <<'PY'
import sqlite3
print("sqlite", sqlite3.sqlite_version)
sqlite3.connect(":memory:").execute(
    "CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram')")
print("FTS5 trigram OK")
PY

python -m pytest -q        # 478 passed 가 기준선
```

---

## 3단계 — 데이터 만들기 (`data/`는 git에 없다)

`data/`는 통째로 `.gitignore` 대상이라 DB·인덱스가 git에 없다. **전부 재생성 가능**하다.
**순서대로** 실행한다.

```bash
cd /opt/GGReportAgent && source .venv/bin/activate

python -m backend.seed                        # ① 기관 25건 → data/registry.db
python -m agent.retrieval build --no-embed    # ② 검색 인덱스 → data/corpus_index.db (수 초)
python -m backend.demo --no-serve             # ③ 데모 DB·데모 인덱스 → data/demo.db
```

**②를 건너뛰지 말 것.** 지식 탭이 503을 띄우는 것도 문제지만, 더 큰 이유는 **대화 탭
속도**다 — 인덱스가 있으면 관련 청크만 발췌해 프롬프트에 넣고, 없으면 코퍼스를 **통째로**
넣는다(`backend/agent_adapter.py`의 `_load_consult_corpus`). CPU 추론에서 그 차이는
수십 초 대 수 분이다.

`--no-embed`인 이유: 임베딩까지 만들면 CPU에서 **약 57분**이 걸린다. 임베딩이 없으면
검색이 FTS 단독으로 조용히 폴백하므로(`agent/retrieval/search.py:19`) 지식 탭은 정상
동작한다 — 결과 행의 표시가 `rrf`가 아니라 `bm25`가 될 뿐이다.

```bash
python -m agent.retrieval search "청년 창업"   # 결과가 나오면 성공
```

---

## 4단계 — LLM 모델

```bash
ollama pull llama3.1:8b        # 약 4.7GB

# 유휴 5분 뒤 모델을 내리는 기본 동작을 끈다 (시연 중 재로딩 수십 초를 없앤다)
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/keepalive.conf >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now ollama
sudo systemctl restart ollama

curl -s localhost:11434/api/tags | grep llama3.1     # 확인
```

> **품질 주의**: `llama3.1:8b`는 배점표의 개별 배점을 **지어낸 실측 전력**이 있다
> (`handoff/NEXT.md` 항목 5). 대화 시연에는 무방하지만, 화면에 나온 수치를 사실로
> 소개하지 말 것. 한국어 품질이 더 필요하면 `qwen2.5:7b`로 바꾸고 아래 `LLM_MODEL`만
> 같이 고치면 된다.

---

## 5단계 — 앱을 서비스로 등록

```bash
sudo tee /etc/systemd/system/ggreport-demo.service >/dev/null <<'EOF'
[Unit]
Description=GGReportAgent demo (uvicorn 127.0.0.1:8000)
After=network-online.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/GGReportAgent
Environment=PYTHONUNBUFFERED=1
Environment=LLM_BASE_URL=http://127.0.0.1:11434/v1
Environment=LLM_MODEL=llama3.1:8b
Environment=LLM_FALLBACK_MODEL=llama3.1:8b
Environment=LLM_API_KEY=not-needed
ExecStart=/opt/GGReportAgent/.venv/bin/python -m backend.demo --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ggreport-demo
curl -s localhost:8000/institutions | head -c 200     # JSON이 나오면 성공
```

**`LLM_FALLBACK_MODEL`을 1순위와 같은 값으로 두는 것이 의도적이다.** `agent/llm.py`의
`_env()`는 빈 문자열을 미설정으로 보고 기본값을 되살리므로, 비워두면 오히려 설치돼 있지도
않은 `llama-4-scout-17b-16e-instruct`가 폴백으로 잡힌다. 1순위와 같은 값을 주면 코드가
폴백 단계를 건너뛴다.

> 서비스를 재시작하면 **데모 데이터가 초기 상태로 다시 깔린다**(`seed()`가 멱등이라
> 중복은 안 생긴다). 시연 중 만든 결재·쪽지를 지우고 싶으면 그냥 재시작하면 된다.
> 운영 자료(`data/registry.db`)는 데모와 파일이 분리돼 있어 영향받지 않는다.

---

## 6단계 — nginx (Basic Auth + 스트리밍)

```bash
# 로그인 계정 (아이디 demo, 비밀번호는 대화형으로 입력)
sudo htpasswd -c /etc/nginx/.htpasswd demo

sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
sudo tee /etc/nginx/nginx.conf >/dev/null <<'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;

events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    access_log    /var/log/nginx/access.log;
    sendfile      on;
    charset       utf-8;

    server {
        listen 80 default_server;
        server_name _;
        client_max_body_size 50M;        # 업로드 검사 데모용

        location / {
            auth_basic           "GGReportAgent demo";
            auth_basic_user_file /etc/nginx/.htpasswd;

            proxy_pass http://127.0.0.1:8000;
            proxy_http_version 1.1;
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # ↓ 대화 탭 스트리밍에 반드시 필요한 3줄
            proxy_buffering    off;      # 없으면 답변이 끝에 한꺼번에 쏟아진다
            proxy_cache        off;
            proxy_read_timeout 300s;     # 기본 60초 — CPU 추론은 그보다 오래 걸린다
            proxy_send_timeout 300s;
        }
    }
}
EOF

sudo nginx -t                       # 문법 확인
sudo systemctl enable --now nginx
sudo systemctl restart nginx

# SELinux가 enforcing이면 (AL2023 기본은 permissive) 프록시 연결을 허용해야 한다
getenforce
sudo setsebool -P httpd_can_network_connect 1 2>/dev/null || true
```

스톡 `nginx.conf`를 통째로 갈아끼우는 이유: 기본 설정에 이미 `listen 80 default_server`
서버 블록이 있어서, `conf.d/`에 파일만 추가하면 **그쪽이 계속 이겨 nginx 기본 페이지가
뜬다.** 단일 목적 데모 서버이므로 최소 설정으로 대체하는 편이 확실하다(원본은 `.bak`).

이제 브라우저에서 **`http://<퍼블릭 IP>/`** → 인증창 → 대시보드.

---

## 시연 당일 절차

**시작**
1. 콘솔에서 인스턴스 **start** → 퍼블릭 IP 확인 (Elastic IP를 안 붙였으면 **매번 바뀐다**)
2. **보안그룹 허용 IP를 오늘 있는 장소의 IP로 갱신** (시연장 와이파이는 사무실과 다르다)
3. `sudo systemctl start ollama ggreport-demo nginx`
4. **웜업** — 대화 탭에 아무 질문이나 한 번 던져 둔다. 첫 호출은 모델 로드까지 겹쳐
   유독 느리다.

**종료 (잊으면 과금)**
- 인스턴스 **stop** (terminate 아님 — EBS가 남아 다음에 그대로 쓴다). 콘솔에서 `stopped`
  확인.

---

## 문제 해결

| 증상 | 원인 | 조치 |
|---|---|---|
| nginx 기본 환영 페이지가 뜬다 | 스톡 `default_server`가 이김 | 6단계의 `nginx.conf` 교체를 했는지 확인 |
| 대화 답변이 끝에 한꺼번에 나옴 | nginx 버퍼링 | `proxy_buffering off;` |
| 1분쯤 뒤 502/504 | 읽기 타임아웃 | `proxy_read_timeout 300s;` |
| "모델 '…'을 찾을 수 없습니다" 말풍선 | `LLM_MODEL` ≠ 설치된 모델 | `ollama list`와 5단계 `LLM_MODEL`을 맞춘다 |
| "LLM 엔드포인트에 닿지 못했습니다" | Ollama 미기동 | `sudo systemctl status ollama` |
| 지식 탭이 503 "빌드 안내" | 인덱스 부재 | 3단계 ②를 실행 |
| 대화가 몇 분씩 걸림 | 인덱스 없이 코퍼스 통째 투입 | 3단계 ②를 실행 후 서비스 재시작 |
| 첫 질문만 유독 느림 | 모델 로딩 | 정상. 4단계의 `OLLAMA_KEEP_ALIVE=-1` + 웜업 |
| 앱이 안 뜬다 | — | `journalctl -u ggreport-demo -n 50` |

```bash
# 로그 한눈에
sudo systemctl status ggreport-demo ollama nginx
journalctl -u ggreport-demo -f
```

---

## 알고 쓸 것 (데모 한정 구성)

- **앱에 로그인이 없다.** 보호는 ⓐ보안그룹 IP 제한 ⓑnginx Basic Auth **두 겹뿐**이다.
  API의 `X-User-Id`는 **자기신고 헤더**라, Basic Auth를 통과한 사람은 그 안에서 누구
  이름으로든 결재할 수 있다. 데모에선 그게 오히려 기능(계정 전환기)이지만 **운영에서는
  결함**이다.
- **HTTPS가 아니다.** 도메인이 없으면 정식 인증서를 못 받는다. Basic Auth 비밀번호가
  평문으로 흐르므로 **아무 데서나 쓰는 비밀번호를 넣지 말 것.** 도메인이 생기면
  certbot으로 올리면 된다.
- **LLM은 EC2 안 Ollama 하나뿐이다.** 외부로 나가지 않아 폐쇄망 가정이 구성으로도
  성립한다. 운영 모델 `gpt-oss-120b`는 65GB급이라 이 구성에 올라가지 않는다 —
  그 검증은 여전히 열린 과제다(`handoff/NEXT.md` 항목 5).
