class Canvas {
  constructor() {
    this.stage = new Konva.Stage({
      container: 'editor',
      width: window.innerWidth,
      height: window.innerHeight,
    });
    this.layer = new Konva.Layer();
    this.selection = {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      rect: new Konva.Rect({
        fill: 'rgba(0, 0, 255, 0.3)',
        stroke: 'rgb(0, 0, 255, 0.5)',
        strokeWidth: 1,
        visible: false,
      }),
    };
    this.transformer = new Konva.Transformer({ rotateEnabled: false });

    this.layer.add(this.selection.rect);
    this.layer.add(this.transformer);
    this.stage.add(this.layer);

    this.getRandomShapes().forEach((shape) => {
      this.layer.add(shape);
    });

    this.layer.on('dragmove', (ev) => this.drawGuidesAndSnap(ev.target));
    this.layer.on('dragend', this.clearSnapLines);
    this.stage.on('mousedown touchstart', this.startSelection);
    this.stage.on('mousemove touchmove', this.moveSelection);
    this.stage.on('mouseup touchend', this.endSelection);
    this.stage.on('click tap', this.clickSelection);

    this.clipboard = [];
    this.container = this.stage.container();
    this.container.tabIndex = 1;
    this.container.focus();
    this.container.addEventListener('keydown', (ev) => {
      const isSelectAll = (ev.ctrlKey || ev.metaKey) && ev.code === 'KeyA';
      const isCopy = (ev.ctrlKey || ev.metaKey) && ev.code === 'KeyC';
      const isPaste = (ev.ctrlKey || ev.metaKey) && ev.code === 'KeyV';
      const isDelete = ev.code === 'Delete';
      if (!isSelectAll && !isCopy && !isPaste && !isDelete) return;
      ev.preventDefault();
      if (isSelectAll) return this.selectAllShapes();
      if (isCopy) return this.copyShapesToClipboard();
      if (isPaste) return this.pasteShapesFromClipboard();
      if (isDelete) return this.deleteSelectedShapes();
    });
  }

  getRandomShapes = () => {
    const shapes = [];
    for (let i = 0; i < 5; i++)
      shapes.push(
        new Konva.Rect({
          x: Math.random() * this.stage.width(),
          y: Math.random() * this.stage.height(),
          width: 50 + Math.random() * 50,
          height: 50 + Math.random() * 50,
          fill: Konva.Util.getRandomColor(),
          draggable: true,
          name: 'rect',
        })
      );
    return shapes;
  };

  drawGuidesAndSnap = (shape) => {
    if (shape === this.transformer) return;
    if (!this.isNodeSelected(shape)) this.transformer.nodes([shape]);
    if (this.transformer.nodes().length > 1) return;
    this.clearSnapLines();
    const allPossibleSnapLines = this.getPossibleSnapPoints(shape);
    const shapeSnapEdges = this.getSnapPointsForShape(shape);
    const candidates = this.getSnapPointsWithinTolerance(
      allPossibleSnapLines,
      shapeSnapEdges
    );
    const snapGuides = this.getSnapGuides(candidates);
    if (!snapGuides.length) return;
    this.drawSnapGuides(snapGuides);
    this.moveShapeToSnap(shape, snapGuides);
  };

  clearSnapLines = () => {
    this.layer.find('.snap-line').forEach((line) => line.destroy());
  };

  getPossibleSnapPoints = (shape) => {
    const vertical = [0, this.stage.width() / 2, this.stage.width()];
    const horizontal = [0, this.stage.height() / 2, this.stage.height()];

    this.stage.find('.rect').forEach((item) => {
      if (item === shape) return;
      const { x, y, width, height } = item.getClientRect();
      vertical.push(x, x + width / 2, x + width);
      horizontal.push(y, y + height / 2, y + height);
    });
    return {
      vertical: vertical.flat(),
      horizontal: horizontal.flat(),
    };
  };

  getSnapPointsForShape = (shape) => {
    const { x, y, width, height } = shape.getClientRect();
    const { x: absX, y: absY } = shape.absolutePosition();

    const shapeSnapEdges = { vertical: [], horizontal: [] };

    for (const direction in shapeSnapEdges) {
      if (!shapeSnapEdges.hasOwnProperty(direction)) continue;
      const axis = direction === 'vertical' ? x : y;
      const dimension = direction === 'vertical' ? width : height;
      const abs = direction === 'vertical' ? absX : absY;
      [
        { snap: 'start', guide: axis },
        { snap: 'center', guide: axis + dimension / 2 },
        { snap: 'end', guide: axis + dimension },
      ].forEach(({ snap, guide }) => {
        shapeSnapEdges[direction].push({
          snap: snap,
          guide: guide,
          offset: abs - guide,
        });
      });
    }

    return shapeSnapEdges;
  };

  getSnapPointsWithinTolerance = (
    possibleSnapLines,
    shapeSnapEdges,
    tolerance = 5
  ) => {
    const candidates = { vertical: [], horizontal: [] };

    for (const direction in candidates) {
      if (!candidates.hasOwnProperty(direction)) continue;
      possibleSnapLines[direction].forEach((snapLine) => {
        shapeSnapEdges[direction].forEach((shapeSnapEdge) => {
          const diff = Math.abs(snapLine - shapeSnapEdge.guide);
          if (diff < tolerance)
            candidates[direction].push({
              ...shapeSnapEdge,
              line: snapLine,
              diff: diff,
            });
        });
      });
    }

    return candidates;
  };

  getSnapGuides = (candidates) => {
    const guides = [];

    for (const direction in candidates) {
      if (!candidates.hasOwnProperty(direction)) continue;

      const sortedCandidates = candidates[direction].sort(
        (a, b) => a.diff - b.diff
      );
      if (sortedCandidates.length) {
        const best = sortedCandidates[0];
        guides.push({
          orientation: direction,
          snap: best.snap,
          line: best.line,
          offset: best.offset,
        });
      }
    }
    return guides;
  };

  drawSnapGuides = (guides) => {
    guides.forEach((guide) => {
      const lineTemplate = {
        stroke: 'rgb(0, 128, 255)',
        strokeWidth: 1,
        name: 'snap-line',
        dash: [4, 6],
      };
      if (guide.orientation === 'vertical') {
        const line = new Konva.Line({
          ...lineTemplate,
          points: [0, 0, 0, this.stage.height()],
        });
        line.absolutePosition({
          x: guide.line,
          y: 0,
        });
        this.layer.add(line);
      } else {
        const line = new Konva.Line({
          ...lineTemplate,
          points: [0, 0, this.stage.width(), 0],
        });
        line.absolutePosition({
          x: 0,
          y: guide.line,
        });
        this.layer.add(line);
      }
    });
  };

  moveShapeToSnap = (shape, guides) => {
    const absPos = shape.absolutePosition();
    guides.forEach((guide) => {
      if (guide.orientation === 'vertical')
        absPos.x = guide.line + guide.offset;
      else absPos.y = guide.line + guide.offset;
      shape.absolutePosition(absPos);
    });
  };

  startSelection = (ev) => {
    if (ev.target !== this.stage) return;
    ev.evt.preventDefault();
    this.selection.x1 = this.stage.getPointerPosition().x;
    this.selection.y1 = this.stage.getPointerPosition().y;
    this.selection.x2 = this.stage.getPointerPosition().x;
    this.selection.y2 = this.stage.getPointerPosition().y;

    this.selection.rect.width(0);
    this.selection.rect.height(0);
    this.selection.rect.visible(true);
  };

  moveSelection = (ev) => {
    if (!this.selection.rect.visible()) return;
    ev.evt.preventDefault();
    this.selection.x2 = this.stage.getPointerPosition().x;
    this.selection.y2 = this.stage.getPointerPosition().y;

    this.selection.rect.setAttrs({
      x: Math.min(this.selection.x1, this.selection.x2),
      y: Math.min(this.selection.y1, this.selection.y2),
      width: Math.abs(this.selection.x2 - this.selection.x1),
      height: Math.abs(this.selection.y2 - this.selection.y1),
    });
  };

  endSelection = (ev) => {
    if (!this.selection.rect.visible()) return;
    ev.evt.preventDefault();
    setTimeout(() => this.selection.rect.visible(false));

    const shapes = this.stage.find('.rect');
    const box = this.selection.rect.getClientRect();
    const selected = shapes.filter((shape) =>
      Konva.Util.haveIntersection(box, shape.getClientRect())
    );
    this.transformer.nodes(selected);
  };

  clickSelection = (ev) => {
    if (this.selection.rect.visible()) return;
    if (ev.target === this.stage) {
      // Clicked an empty area
      this.transformer.nodes([]);
      return;
    }
    if (!ev.target.hasName('rect')) return;

    const modifierKeyPressed =
      ev.evt.shiftKey || ev.evt.ctrlKey || ev.evt.metaKey;
    const isSelected = this.isNodeSelected(ev.target);

    let nodes;
    if (!modifierKeyPressed && !isSelected) {
      // Select single
      nodes = [ev.target];
    } else if (modifierKeyPressed && isSelected) {
      // Deselect already selected
      nodes = this.transformer.nodes().slice();
      nodes.splice(nodes.indexOf(ev.target), 1);
    } else if (modifierKeyPressed && !isSelected) {
      // Add to selection
      nodes = this.transformer.nodes().concat([ev.target]);
    }
    this.transformer.nodes(nodes);
  };

  isNodeSelected = (node) => this.transformer.nodes().indexOf(node) > -1;

  selectAllShapes = () => {
    const shapes = this.stage.find('.rect');
    this.transformer.nodes(shapes);
  };

  copyShapesToClipboard = () => {
    this.clipboard.forEach((shape) => shape.destroy());
    this.clipboard = this.transformer.nodes().map((shape) => shape.clone());
  };

  pasteShapesFromClipboard = () => {
    const clones = this.clipboard.map((shape) => {
      const clone = shape.clone();
      const absPos = clone.absolutePosition();
      absPos.x += 20;
      absPos.y += 20;
      clone.absolutePosition(absPos);
      clone.fill(Konva.Util.getRandomColor());
      this.layer.add(clone);
      return clone;
    });
    this.transformer.nodes(clones);
  };

  deleteSelectedShapes = () => {
    this.transformer.nodes().forEach((shape) => shape.destroy());
    this.transformer.nodes([]);
  };
}

const canvas = new Canvas();
console.log('Created canvas:', canvas);
