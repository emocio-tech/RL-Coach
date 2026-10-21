from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse
from app.services import coach, storage

router = APIRouter()


@router.post("", response_model=ChatResponse)
def post_chat(request: ChatRequest):
    game_id = request.game_id or None
    if game_id is not None and storage.get_game_report(game_id) is None:
        raise HTTPException(status_code=404, detail="Partie introuvable.")
    try:
        result = coach.chat(request.messages, game_id, request.selected_player)
    except coach.CoachConfigError:
        raise HTTPException(
            status_code=503, detail="Le coach IA n'est pas configuré (clé API manquante)."
        )
    except coach.CoachTimeoutError:
        raise HTTPException(
            status_code=504, detail="Le coach met trop de temps à répondre. Réessaie dans un instant."
        )
    except coach.CoachUnavailableError:
        raise HTTPException(
            status_code=502, detail="Le coach IA est indisponible pour le moment. Réessaie plus tard."
        )
    except coach.CoachError:
        raise HTTPException(
            status_code=502, detail="Le coach n'a pas pu produire de réponse. Réessaie."
        )
    return ChatResponse(reply=result.reply, prompt=result.prompt, heatmaps=result.heatmaps)
