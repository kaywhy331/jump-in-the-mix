.PHONY: start stop restart logs status doctor reset test check

start:
	./start-local.sh

stop:
	./stop-local.sh

restart:
	docker compose restart web worker

logs:
	docker compose logs -f web worker

status:
	docker compose ps

doctor:
	./doctor.sh

reset:
	./reset-local.sh

test:
	npm test

check:
	npm run check
