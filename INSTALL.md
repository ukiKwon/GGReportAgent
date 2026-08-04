# INSTALL — AWS EC2(Amazon Linux 2023) 데모 서버 구축 매뉴얼

**이 문서 하나만 보고 빈 AWS 계정에서 시연용 대시보드를 띄울 수 있게 쓴 매뉴얼이다.**
다른 문서를 먼저 읽을 필요는 없다.

- 왜 이렇게 구성했는지(의사결정과 근거): `docs/superpowers/plans/2026-08-04-aws-ec2-demo-deploy.md`
- 화면 사용법(탭별 조작): `docs/실행가이드_backend-agent.md`
- **개발 PC(Windows)에서 그냥 돌리고 싶다면** 이 문서가 아니라
  `handoff/NEXT.md`의 "새 PC에서 이어받을 때" 절차(`py -3 -m backend.demo`)를 보면 된다.

---

## 0. 먼저 알아둘 구조 — 왜 명령 하나로 안 끝나는가

```
 [시연자 브라우저] ──HTTP :80──▶ nginx ──proxy──▶ 127.0.0.1:8000 uvicorn(앱)
                    Basic Auth    (EC2 보안그룹이 IP로 1차 차단)      │
                                                                     │ OpenAI 호환
                                                                     ▼
                                                          127.0.0.1:11434 Ollama
                                                             llama3.1:8b (CPU)
```

세 가지를 먼저 이해하면 이 문서가 쉬워진다.

1. **앱은 `127.0.0.1:8000`에만 바인딩된다**(`backend/demo.py`). 즉 **앱만 켜서는 밖에서
   절대 안 보인다.** nginx(7단계)가 반드시 앞에 서야 하고, 그래서 접속 주소도
   `:8000`이 아니라 **80포트(포트번호 없는 주소)** 다. 이건 실수가 아니라 의도된 구성이다
   — 앱 포트가 인터넷에 직접 열리지 않는다.
2. **`data/`는 git에 없다.** `.gitignore` 대상이라 `git clone` 후 DB·검색 인덱스를
   **직접 만들어야 한다**(4단계). 전부 재생성 가능하므로 잃는 정보는 없다.
3. **LLM은 이 EC2 안의 Ollama 하나뿐이다.** 외부 API로 나가지 않는다(폐쇄망 가정).

### 한눈에 — 최초 1회 vs 매번

| | 무엇을 | 어디 |
|---|---|---|
| **최초 1회** (30~60분) | 인스턴스 생성 → 런타임 설치 → clone → 데이터 생성 → 모델 받기 → 서비스·nginx 등록 | 1~7단계 |
| **시연 때마다** (3~5분) | 인스턴스 **start** → 보안그룹 IP 갱신 → 웜업 질문 1회 | 9단계 |
| **시연 끝나면** | 인스턴스 **stop** (안 하면 과금) | 9단계 |

> 6단계에서 `systemctl enable`을 하므로, **두 번째부터는 인스턴스를 start하면 앱·Ollama·
> nginx가 자동으로 뜬다.** 매번 명령을 칠 필요가 없다.

---

## 1. EC2 인스턴스 만들기

콘솔 → EC2 → **인스턴스 시작**.

| 항목 | 값 | 이유 |
|---|---|---|
| AMI | **Amazon Linux 2023** | |
| 인스턴스 유형 | **`c7i.2xlarge`** (8 vCPU / 16GB) | 아래 ⚠️ |
| 스토리지 | **gp3 40GB** | 리포 + 모델 4.7GB + `data/` + 여유 |
| 키 페어 | 새로 생성해 `.pem` 보관 | SSH 접속용 |

⚠️ **`t3`류(버스터블)를 쓰지 말 것.** LLM 추론은 CPU를 100%로 오래 문다. t3는 CPU
크레딧을 소진하면 baseline(t3.xlarge 기준 40%)으로 **강제 스로틀**되어 시연 중반부터
급격히 느려진다. "느려도 감수한다"와 "시연 도중 더 느려진다"는 다른 얘기다.

**보안그룹 인바운드** — 아래 2개만. `8000`(앱)·`11434`(Ollama)는 **열지 않는다**.

| 유형 | 포트 | 소스 |
|---|---|---|
| SSH | 22 | **내 IP** (콘솔 드롭다운에 "내 IP" 항목이 있다) |
| HTTP | 80 | **내 IP** |

### 탄력적 IP(Elastic IP) 연결 — 권장

인스턴스를 stop/start 하면 **퍼블릭 IP가 매번 바뀐다.** 시연 때마다 주소를 다시
확인하고 보안그룹까지 손보는 게 번거로우므로 고정 IP를 붙인다.

콘솔 → EC2 → **네트워크 및 보안 → 탄력적 IP** → *탄력적 IP 주소 할당* →
할당된 주소 선택 → *작업 → 탄력적 IP 주소 연결* → 이 인스턴스 선택.

> 💰 **비용 주의**: 2024년 2월부터 AWS는 **모든 퍼블릭 IPv4 주소에 시간당 약 $0.005를
> 과금**한다. 인스턴스를 정지해 둔 동안에도 EIP를 붙여 두면 **월 $3~4 정도**가 나온다
> (EBS 40GB와 비슷한 수준). 고정 주소의 편의를 살 만한 값이라 붙이길 권하지만,
> **아깝다면 붙이지 않고 매번 바뀌는 IP를 확인해 쓰면 된다**(8단계에 확인 방법이 있다).
> 다만 **인스턴스를 terminate한 뒤 EIP만 남겨두면 계속 과금**되니, 프로젝트를 접을 때는
> EIP도 **릴리스**할 것.

접속: `ssh -i <키>.pem ec2-user@<퍼블릭 IP>`

---

## 2. 런타임 한 방 설치

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

## 3. 리포 + 파이썬 의존성

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

> **private 리포라면** 위 `git clone`이 인증을 묻고 실패한다(GitHub는 비밀번호 인증을
> 막았다). 둘 중 하나를 쓴다.
> - **PAT**: GitHub → Settings → Developer settings → Personal access tokens에서 `repo`
>   읽기 권한 토큰 생성 →
>   `git clone https://<토큰>@github.com/ukiKwon/GGReportAgent.git /opt/GGReportAgent`
> - **Deploy key**(더 안전, 이 리포에만 유효): EC2에서 `ssh-keygen -t ed25519` → 공개키를
>   리포 Settings → Deploy keys에 등록 →
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

여기서 깨지면 배포 문제가 아니라 환경 문제이므로 **먼저 해결하고 다음으로 넘어간다.**

---

## 4. 데이터 만들기 (`data/`는 git에 없다)

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
검색이 FTS 단독으로 조용히 폴백하므로(`agent/retrieval/search.py`) 지식 탭은 정상
동작한다 — 결과 행의 표시가 `rrf`가 아니라 `bm25`가 될 뿐이다.

```bash
python -m agent.retrieval search "청년 창업"   # 결과가 나오면 성공
```

---

## 5. LLM 모델

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
> (`handoff/NEXT.md` 항목 5). 대화 시연에는 무방하지만, **화면에 나온 수치를 사실로
> 소개하지 말 것.** 한국어 품질이 더 필요하면 `qwen2.5:7b`로 바꾸고 6단계의 `LLM_MODEL`을
> 같이 고치면 된다.

---

## 6. 앱을 서비스로 등록

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
sudo systemctl enable --now ggreport-demo            # enable = 부팅 시 자동 기동
curl -s localhost:8000/institutions | head -c 200    # JSON이 나오면 성공
```

**`LLM_FALLBACK_MODEL`을 1순위와 같은 값으로 두는 것이 의도적이다.** `agent/llm.py`의
`_env()`는 빈 문자열을 미설정으로 보고 기본값을 되살리므로, 비워두면 오히려 설치돼 있지도
않은 `llama-4-scout-17b-16e-instruct`가 폴백으로 잡힌다. 1순위와 같은 값을 주면 코드가
폴백 단계를 건너뛴다.

> 서비스를 재시작하면 **데모 데이터가 초기 상태로 다시 깔린다**(`seed()`가 멱등이라
> 중복은 안 생긴다). 시연 중 만든 결재·쪽지를 지우고 싶으면 그냥 재시작하면 된다.
> 운영 자료(`data/registry.db`)는 데모(`data/demo.db`)와 파일이 분리돼 있어 영향받지 않는다.

---

## 7. nginx (Basic Auth + 스트리밍)

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

            # ↓ 대화 탭 스트리밍에 반드시 필요한 설정
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

---

## 8. 접속 — URL이 무엇인가

```
http://<EC2 퍼블릭 IPv4 주소>/
```

- **포트번호를 붙이지 않는다.** `:8000`은 밖에서 안 열린다(§0 참조). nginx의 80포트로 들어간다.
- 열면 **Basic Auth 창** → 7단계에서 만든 아이디(`demo`)와 비밀번호 → 대시보드.
- `https://`가 아니라 **`http://`** 다(9단계 아래 "알고 쓸 것" 참조).

**퍼블릭 IP 확인 방법**
- 탄력적 IP를 붙였다면 → 그 주소가 계속 그대로다.
- 안 붙였다면 → EC2 콘솔 인스턴스 요약의 **"퍼블릭 IPv4 주소"** (start할 때마다 바뀐다).
- 인스턴스 안에서 확인:

```bash
TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
     http://169.254.169.254/latest/meta-data/public-ipv4; echo
```

**접속이 안 될 때 이 순서로 확인한다.**

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:8000/institutions   # 200 → 앱 정상
curl -s -o /dev/null -w '%{http_code}\n' -u demo:<비번> localhost/     # 200 → nginx 정상
```
- 둘 다 200인데 브라우저에서만 안 되면 → **보안그룹의 80포트 허용 IP가 지금 내 IP와
  다른 것이다**(가장 흔한 원인). 콘솔에서 "내 IP"로 다시 저장한다.
- 401만 나오면 → 비밀번호. `sudo htpasswd /etc/nginx/.htpasswd demo`로 재설정.

---

## 9. 시연 당일 절차

**시작 (3~5분)**

1. 콘솔에서 인스턴스 **start**.
2. **보안그룹의 허용 IP를 오늘 있는 장소의 IP로 갱신** — 시연장 와이파이는 사무실과
   다르다. (탄력적 IP를 붙였어도 **내 쪽 IP는 바뀐다.** 이건 별개다.)
3. 서비스가 떴는지 확인 — 6단계에서 `enable`했으므로 **보통 자동으로 떠 있다**.
   ```bash
   sudo systemctl status ggreport-demo ollama nginx --no-pager | grep -E 'Active|●'
   # 혹시 안 떠 있으면
   sudo systemctl start ollama ggreport-demo nginx
   ```
4. **웜업** — 브라우저로 접속해 대화 탭에 아무 질문이나 **한 번 던져 둔다.** 첫 호출은
   모델 로드까지 겹쳐 유독 느리다.

**종료 (잊으면 과금)**

- 콘솔에서 인스턴스 **stop**. **terminate가 아니다** — EBS가 남아 다음에 그대로 쓴다.
- 콘솔에서 상태가 `stopped`인지 **눈으로 확인**한다.

**시연 전 화면 체크리스트**

| 화면 | 확인할 것 | LLM 필요? |
|---|---|---|
| 대시보드(지도) | 25개 구 색, 클릭 시 퀵뷰 | ✗ |
| 입찰상황판 | 공고 2건, 임박도 색 | ✗ |
| 워크플로 탭 | 9단계 스테퍼·참여자 카드·지시/보고 로그·배점표 매핑 | ✗ |
| 참여 결정 | 계정 전환기로 tier 1·2·3 순차 결재 | ✗ |
| 쪽지함 | 배지, 발송 | ✗ |
| 지식 탭 | 검색 결과(`bm25`), 원문 열기 | ✗ |
| **대화 탭** | 답이 **글자 단위로** 흘러나온다 | **✓** |
| 워크플로 '실행' | 오케스트레이터 기동 | **✓** (느림 — 시연 비권장) |

> 💡 **대화 탭은 마지막에 보여주는 편이 좋다.** 나머지 화면은 전부 LLM과 무관하게 즉시
> 뜨므로, 느린 것 하나 때문에 시연 전체의 인상이 좌우되지 않게 배치한다.

---

## 10. 자주 쓰는 명령

```bash
# 상태 / 로그
sudo systemctl status ggreport-demo ollama nginx
journalctl -u ggreport-demo -f

# 앱만 재시작 (데모 데이터가 초기 상태로 돌아간다)
sudo systemctl restart ggreport-demo

# 코드를 새로 받았을 때
cd /opt/GGReportAgent && git pull && source .venv/bin/activate \
  && pip install -r requirements.txt \
  && sudo systemctl restart ggreport-demo

# 코퍼스가 바뀌었을 때 검색 인덱스 갱신
cd /opt/GGReportAgent && source .venv/bin/activate \
  && python -m agent.retrieval reindex --no-embed \
  && sudo systemctl restart ggreport-demo

# 데모 데이터 완전 삭제
cd /opt/GGReportAgent && source .venv/bin/activate \
  && python -m backend.demo --reset --no-serve
```

---

## 11. 문제 해결

| 증상 | 원인 | 조치 |
|---|---|---|
| 브라우저에서 아예 안 열림 | 보안그룹 허용 IP 불일치 | 8단계의 확인 순서를 따른다 (가장 흔함) |
| nginx 기본 환영 페이지가 뜬다 | 스톡 `default_server`가 이김 | 7단계의 `nginx.conf` 교체를 했는지 확인 |
| 대화 답변이 끝에 한꺼번에 나옴 | nginx 버퍼링 | `proxy_buffering off;` (7단계) |
| 1분쯤 뒤 502/504 | 읽기 타임아웃 | `proxy_read_timeout 300s;` (7단계) |
| "모델 '…'을 찾을 수 없습니다" 말풍선 | `LLM_MODEL` ≠ 설치된 모델 | `ollama list`와 6단계 `LLM_MODEL`을 맞춘다 |
| "LLM 엔드포인트에 닿지 못했습니다" | Ollama 미기동 | `sudo systemctl status ollama` |
| 지식 탭이 503 "빌드 안내" | 인덱스 부재 | 4단계 ②를 실행 |
| 대화가 몇 분씩 걸림 | 인덱스 없이 코퍼스 통째 투입 | 4단계 ② 실행 후 앱 재시작 |
| 첫 질문만 유독 느림 | 모델 로딩 | 정상. 5단계 `OLLAMA_KEEP_ALIVE=-1` + 웜업 |
| 시연 중반부터 급격히 느려짐 | `t3` CPU 크레딧 소진 | 인스턴스 유형을 `c7i`로 (1단계) |
| 앱이 안 뜬다 | — | `journalctl -u ggreport-demo -n 50` |
| 답변이 문맥을 잊음 | Ollama 기본 컨텍스트보다 프롬프트가 길어 **조용히 잘림** | 알려진 한계. 질문을 짧게 하거나 Modelfile로 `num_ctx`를 올린다 |

---

## 12. 알고 쓸 것 (데모 한정 구성이다)

- **앱에 로그인이 없다.** 보호는 ⓐ보안그룹 IP 제한 ⓑnginx Basic Auth **두 겹뿐**이다.
  API의 `X-User-Id`는 **자기신고 헤더**라, Basic Auth를 통과한 사람은 그 안에서 누구
  이름으로든 결재할 수 있다. 데모에선 그게 오히려 기능(계정 전환기)이지만 **운영에서는
  결함**이며, 운영 전환 시 앱 로그인 구현이 별도로 필요하다.
- **HTTPS가 아니다.** 도메인이 없으면 정식 인증서를 못 받는다. Basic Auth 비밀번호가
  평문으로 흐르므로 **다른 곳에서 쓰는 비밀번호를 넣지 말 것.** 도메인이 생기면
  certbot으로 올리면 된다.
- **답변 속도는 느리다.** GPU가 아니라 CPU 추론이라 답변 1건에 수십 초~수 분이 걸린다.
  이건 고장이 아니라 선택한 구성의 결과다(5단계 웜업·4단계 인덱스가 최선의 완화책).
- **LLM은 EC2 안 Ollama 하나뿐이다.** 외부로 나가지 않아 폐쇄망 가정이 구성으로도
  성립한다. 운영 모델 `gpt-oss-120b`는 65GB급이라 이 구성에 올라가지 않는다 — 그 검증은
  여전히 열린 과제다(`handoff/NEXT.md` 항목 5).
- **비용은 "정지했는지"가 좌우한다.** 인스턴스 정지 중에도 EBS 40GB(월 $3~4)와, 탄력적
  IP를 붙였다면 그 요금(월 $3~4)이 계속 나간다. 가동 중에는 인스턴스 요금이 시간당
  $0.4 안팎으로 붙으므로 **stop을 잊으면 월 $250+** 가 된다.
