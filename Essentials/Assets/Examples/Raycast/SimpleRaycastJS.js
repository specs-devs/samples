//@component
/**
 * SPECS Inc. 2027
 * Simple raycast for the Essentials lens: casts a ray from rayStart to rayEnd every frame,
 * moves endPointAttachment to the hit position and (optionally) writes what was hit to a Text.
 */

//@input SceneObject rayStart {"hint":"The starting point of the raycast"}
//@input SceneObject rayEnd {"hint":"The ending point of the raycast"}
//@input SceneObject endPointAttachment {"hint":"Scene object to place at the raycast hit position", "allowUndefined": true}
//@input bool hideMarkerWhenNoHit = true {"hint":"Hide endPointAttachment while the ray hits nothing"}
//@input SceneObject hitsUnder {"hint":"Optional: only colliders under this object count (UI panels and other content in front are ignored)", "allowUndefined": true}
//@input Component.Text statusText {"hint":"Optional Text that shows what the ray hits and how far away", "allowUndefined": true}

var probe = null;
var lastStatus = "";

function setStatus(value) {
  if (script.statusText && value !== lastStatus) {
    script.statusText.text = value;
    lastStatus = value;
  }
}

function updateRaycast() {
  if (!script.rayStart || !script.rayEnd) {
    return;
  }
  if (!probe) {
    probe = Physics.createGlobalProbe();
  }
  var start = script.rayStart.getTransform().getWorldPosition();
  var end = script.rayEnd.getTransform().getWorldPosition();
  probe.rayCastAll(start, end, function (hits) {
    var hit = null;
    for (var i = 0; i < hits.length && !hit; i++) {
      if (counts(hits[i].collider.getSceneObject())) hit = hits[i];
    }
    if (hit) {
      if (script.endPointAttachment) {
        script.endPointAttachment.enabled = true;
        script.endPointAttachment.getTransform().setWorldPosition(hit.position);
      }
      setStatus("Ray hits " + hit.collider.getSceneObject().name + " at " + Math.round(hit.position.distance(start)) + " cm");
    } else {
      if (script.endPointAttachment && script.hideMarkerWhenNoHit) {
        script.endPointAttachment.enabled = false;
      }
      setStatus("Ray hits nothing: look at the box");
    }
  });
}

function counts(object) {
  if (!script.hitsUnder) return true;
  var current = object;
  while (current) {
    if (current === script.hitsUnder) return true;
    current = current.getParent();
  }
  return false;
}

script.createEvent("UpdateEvent").bind(updateRaycast);
