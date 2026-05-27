"""Reward Model — computes reward signals from teaching episodes."""

from __future__ import annotations

from core.state import Episode, Interaction


class RewardModel:
    WEIGHTS = {
        "correct": 2.0,
        "partial": 0.5,
        "wrong": -1.0,
        "eng_high": 1.0,
        "eng_low": -0.5,
        "conf_gain": 1.5,
        "conf_drop": -1.0,
        "retention_1d": 2.0,
        "retention_7d": 3.0,
        "mastery_gain": 2.0,
        "mastery_loss": -1.5,
        "frustration_high": -1.0,
        "frustration_low": 0.5,
    }

    def compute(self, ep: Episode) -> float:
        r = 0.0
        for i in ep.interactions:
            if not isinstance(i, Interaction):
                continue
            if i.type == "quiz":
                if i.correct:
                    r += self.WEIGHTS["correct"]
                elif i.partial:
                    r += self.WEIGHTS["partial"]
                else:
                    r += self.WEIGHTS["wrong"]

        if ep.duration > 0:
            count = len(ep.utterances) if ep.utterances else len(ep.interactions)
            ratio = count / max(ep.duration, 1.0)
            if ratio > 2.0:
                r += self.WEIGHTS["eng_high"]
            elif ratio < 0.5:
                r += self.WEIGHTS["eng_low"]

        conf_delta = ep.post_conf - ep.pre_conf
        if conf_delta > 0:
            r += conf_delta * self.WEIGHTS["conf_gain"]
        else:
            r += abs(conf_delta) * self.WEIGHTS["conf_drop"]

        mastery_delta = ep.post_mastery - ep.pre_mastery
        if mastery_delta > 0:
            r += mastery_delta * self.WEIGHTS["mastery_gain"]
        else:
            r += abs(mastery_delta) * self.WEIGHTS["mastery_loss"]

        avg_frust = 0.0
        if ep.interactions:
            frust_vals = [i.frustration for i in ep.interactions if isinstance(i, Interaction)]
            if frust_vals:
                avg_frust = sum(frust_vals) / len(frust_vals)
        if avg_frust > 0.6:
            r += self.WEIGHTS["frustration_high"]
        elif avg_frust < 0.3:
            r += self.WEIGHTS["frustration_low"]

        if ep.mastered:
            r += 3.0

        return r

    def compute_step(self, interaction: Interaction, pre_mastery: float, post_mastery: float,
                     pre_conf: float, post_conf: float) -> float:
        r = 0.0
        if interaction.type == "quiz":
            if interaction.correct:
                r += self.WEIGHTS["correct"]
            elif interaction.partial:
                r += self.WEIGHTS["partial"]
            else:
                r += self.WEIGHTS["wrong"]

        mastery_delta = post_mastery - pre_mastery
        if mastery_delta > 0:
            r += mastery_delta * self.WEIGHTS["mastery_gain"]
        else:
            r += abs(mastery_delta) * self.WEIGHTS["mastery_loss"]

        conf_delta = post_conf - pre_conf
        if conf_delta > 0:
            r += conf_delta * self.WEIGHTS["conf_gain"]

        return r
