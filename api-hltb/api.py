import concurrent.futures
import os
from flask import Flask, jsonify
from flask_cors import CORS
from howlongtobeatpy import HowLongToBeat

app = Flask(__name__)

# --- Configuração de CORS Dinâmica ---
origins = os.environ.get('CORS_ORIGIN', '').split(',')
if not origins or origins == ['']:
    print("AVISO: A variável de ambiente CORS_ORIGIN não está definida. CORS não estará ativo.")
CORS(app, resources={r"/*": {"origins": origins}})

# Quantos candidatos no máximo devolver numa busca por título.
MAX_RESULTS = 15

# Quanto esperamos o HowLongToBeat antes de desistir. Uma busca saudável leva
# entre 3 e 6 segundos, então 15 é folga sem virar espera infinita.
UPSTREAM_TIMEOUT = 15

# A howlongtobeatpy não expõe timeout — nem no construtor, nem no search(). O
# limite então é imposto por fora: a chamada roda numa thread e a requisição
# desiste de esperar por ela. A thread órfã termina sozinha depois; o que
# importa é que a requisição HTTP não fica pendurada até o gunicorn matar o
# worker, derrubando junto quem mais estivesse sendo atendido por ele.
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="hltb")


def com_timeout(fn, *args):
    """Roda `fn` no executor e desiste depois de UPSTREAM_TIMEOUT segundos."""
    return _executor.submit(fn, *args).result(timeout=UPSTREAM_TIMEOUT)


def falha_upstream(e):
    """Traduz uma falha de consulta num status HTTP honesto, sem vazar detalhe interno.

    O `details` antigo devolvia a exceção crua ao cliente — mensagem de scraping,
    caminho de arquivo, às vezes pedaço do HTML da página. Isso agora vai só para
    o log do servidor, e o cliente recebe uma frase que dá para mostrar na tela.
    """
    app.logger.warning("Falha ao consultar o HowLongToBeat: %s", e)
    if isinstance(e, concurrent.futures.TimeoutError):
        return jsonify({"error": "O HowLongToBeat demorou demais para responder."}), 504
    return jsonify({"error": "Não foi possível consultar o HowLongToBeat."}), 502


def serialize(entry):
    """Converte um HowLongToBeatEntry no formato que o app consome."""
    return {
        "hltb_id": entry.game_id,
        "name": entry.game_name,
        "year": entry.release_world,        # ano de lançamento (pode ser None)
        "image_url": entry.game_image_url,
        "similarity": entry.similarity,
        "times": {
            "main_story": entry.main_story,
            "main_extra": entry.main_extra,
            "completionist": entry.completionist,
        },
    }


@app.route('/howlongtobeat/search/<query>', methods=['GET'])
def search_games(query):
    """Busca por título e devolve vários candidatos, pra desambiguação no cliente.

    Ordenado por similaridade (mais parecido com o termo buscado primeiro).
    Jogos de mesmo nome (ex: remake) vêm juntos e se distinguem pelo `year`.
    """
    try:
        results = com_timeout(HowLongToBeat().search, query) or []
        results.sort(key=lambda e: e.similarity or 0, reverse=True)
        return jsonify({"results": [serialize(e) for e in results[:MAX_RESULTS]]})
    except Exception as e:
        return falha_upstream(e)


@app.route('/howlongtobeat/game/<int:game_id>', methods=['GET'])
def game_by_id(game_id):
    """Busca exata por id do HLTB — usado pelo escape hatch de colar link/id."""
    try:
        entry = com_timeout(HowLongToBeat().search_from_id, game_id)
        if entry is None:
            return jsonify({"error": f"Jogo com id {game_id} não encontrado"}), 404
        return jsonify(serialize(entry))
    except Exception as e:
        return falha_upstream(e)


if __name__ == '__main__':
    app.run(debug=True)
