// Singleton with helper methods for level entities
define([
    'ash',
    'game/constants/LocaleConstants',
    'game/constants/PositionConstants',
    'game/constants/MovementConstants',
    'game/constants/SectorConstants',
    'game/constants/WorldCreatorConstants',
    'game/nodes/level/LevelNode',
    'game/nodes/sector/SectorNode',
    'game/components/common/PositionComponent',
    'game/components/common/RevealedComponent',
    'game/components/common/CampComponent',
    'game/components/common/VisitedComponent',
    'game/components/type/LevelComponent',
    'game/components/sector/SectorStatusComponent',
    'game/components/sector/SectorLocalesComponent',
    'game/components/sector/SectorFeaturesComponent',
    'game/components/sector/SectorControlComponent',
    'game/components/sector/PassagesComponent',
    'game/components/sector/improvements/SectorImprovementsComponent',
    'game/components/sector/improvements/WorkshopComponent',
    'game/components/level/LevelPassagesComponent',
    'game/vos/LevelProjectVO',
    'game/vos/ImprovementVO',
    'game/vos/PositionVO'
], function (
	Ash,
	LocaleConstants,
	PositionConstants,
	MovementConstants,
	SectorConstants,
    WorldCreatorConstants,
	LevelNode, 
    SectorNode,
	PositionComponent,
    RevealedComponent,
    CampComponent,
    VisitedComponent,
    LevelComponent,
	SectorStatusComponent,
	SectorLocalesComponent,
	SectorFeaturesComponent,
	SectorControlComponent,
	PassagesComponent,
	SectorImprovementsComponent,
	WorkshopComponent,
	LevelPassagesComponent,
	LevelProjectVO,
	ImprovementVO,
    PositionVO
) {
    var LevelHelper = Ash.Class.extend({
        
		engine: null,
		levelNodes: null,
		sectorNodes: null,
        
        sectorEntitiesByPosition: {}, // int (level) -> int (x) -> int (y) -> entity
        sectorEntitiesByLevel: {}, // int (level) -> []
		
		playerActionsHelper: null,
		
		constructor: function (engine, gameState, playerActionsHelper, movementHelper) {
			this.engine = engine;
			this.gameState = gameState;
			this.playerActionsHelper = playerActionsHelper;
            this.movementHelper = movementHelper;
			this.levelNodes = engine.getNodeList(LevelNode);
			this.sectorNodes = engine.getNodeList(SectorNode);
		},
        
        reset: function () {
            this.sectorEntitiesByPosition = {};
            this.sectorEntitiesByLevel = {};
        },
		
		getLevelEntityForSector: function (sectorEntity) {
			var levelPosition;
			var sectorPosition = sectorEntity.get(PositionComponent);
			for (var node = this.levelNodes.head; node; node = node.next) {
				levelPosition = node.entity.get(PositionComponent);
				if (levelPosition.level === sectorPosition.level) return node.entity;
			}
			console.log("WARN: No level entity found for sector with position " + sectorPosition);
			return null;
		},
		
		getLevelEntityForPosition: function (level) {
			var levelPosition;
			for (var node = this.levelNodes.head; node; node = node.next) {
				levelPosition = node.entity.get(PositionComponent);
				if (levelPosition.level === level) return node.entity;
			}
			return null;
		},
		
		getSectorByPosition: function (level, sectorX, sectorY) {
			var sectorPosition;
            
            // TODO check if saving uses up too much memory / this is the neatest way, speeds up fps a lot (esp for map)
            
            if (!this.sectorEntitiesByPosition[level]) this.sectorEntitiesByPosition[level] = {};
            if (!this.sectorEntitiesByPosition[level][sectorX]) this.sectorEntitiesByPosition[level][sectorX] = {};
            
            if (this.sectorEntitiesByPosition[level][sectorX][sectorY]) return this.sectorEntitiesByPosition[level][sectorX][sectorY];
            
            if (this.sectorEntitiesByPosition[level][sectorX][sectorY] === null) return null;
            
			for (var node = this.sectorNodes.head; node; node = node.next) {
				sectorPosition = node.entity.get(PositionComponent);
				if (sectorPosition.level === level && sectorPosition.sectorX === sectorX && sectorPosition.sectorY === sectorY) {
                    this.sectorEntitiesByPosition[level][sectorX][sectorY] = node.entity;
                    return node.entity;
                }
			}
            
            this.sectorEntitiesByPosition[level][sectorX][sectorY] = null;
            
			return null;
		},
        
        getSectorNeighboursList: function (sector) {
            if (!sector)
                return null;
			var result = [];
            var sectorPos = sector.get(PositionComponent);
			var startingPos = sectorPos.getPosition();
			for (var i in PositionConstants.getLevelDirections()) {
				var direction = PositionConstants.getLevelDirections()[i];
				var neighbourPos = PositionConstants.getPositionOnPath(startingPos, direction, 1);
                var neighbour = this.getSectorByPosition(neighbourPos.level, neighbourPos.sectorX, neighbourPos.sectorY);
				if (neighbour) {
					result.push(neighbour);
				}
			}
			return result;
        },
        
        getSectorNeighboursMap: function (sector) {
            if (!sector)
                return null;
			var result = {};
            var sectorPos = sector.get(PositionComponent);
			var startingPos = sectorPos.getPosition();
			for (var i in PositionConstants.getLevelDirections()) {
				var direction = PositionConstants.getLevelDirections()[i];
				var neighbourPos = PositionConstants.getPositionOnPath(startingPos, direction, 1);
                var neighbour = this.getSectorByPosition(neighbourPos.level, neighbourPos.sectorX, neighbourPos.sectorY);
                result[direction] = neighbour;
			}
			return result;
        },
		
        findPathTo: function (startSector, goalSector, settings) {     
            // Simple breadth-first search (implement A* if movement cost needs to be considered)
            
            if (!startSector) {
                console.log("WARN: No start sector defined.");
            }
            
            if (!goalSector) {
                console.log("WARN: No goal sector defined.");
            }
            
            if (!settings) settings = {};
            
            var startLevel = startSector.get(PositionComponent).level;
            var goalLevel = goalSector.get(PositionComponent).level;
            
            if (startLevel > goalLevel) {
                var passageDown = this.findPassageDown(startLevel, settings.includeUnbuiltPassages);
                if (passageDown) {
                    var passageDownPos = passageDown.get(PositionComponent);
                    var passageUp = this.getSectorByPosition(passageDownPos.level - 1, passageDownPos.sectorX, passageDownPos.sectorY);
                    var combined = this.findPathTo(startSector, passageDown, settings).concat([passageUp]).concat(this.findPathTo(passageUp, goalSector, settings));
                    return combined;
                } else {
                    console.log("Can't find path because there is no passage from level " + startLevel + " to level " + goalLevel)
                }
            } else if (startLevel < goalLevel) {
                var passageUp = this.findPassageUp(startLevel, settings.includeUnbuiltPassages);
                if (passageUp) {
                    var passageUpPos = passageUp.get(PositionComponent);
                    var passageDown = this.getSectorByPosition(passageUpPos.level + 1, passageUpPos.sectorX, passageUpPos.sectorY);
                    var combined = this.findPathTo(startSector, passageUp, settings).concat([passageDown]).concat(this.findPathTo(passageDown, goalSector, settings));
                    return combined;
                } else {
                    console.log("Can't find path because there is no passage from level " + startLevel + " to level " + goalLevel)
                }
            }
            
            var frontier = [];
            var visited = [];
            var cameFrom = {};
            
            var getKey = function (sector) {
                return sector.get(PositionComponent).getPosition().toString();
            };
            
            var movementHelper = this.movementHelper;
            var isValid = function (sector, startSector, direction) {
                if (settings && settings.skipUnvisited && !sector.has(VisitedComponent))
                    return false;
                if (settings && settings.skipBlockers && movementHelper.isBlocked(startSector, direction)) {
                    return false;
                }
                return true;
            };
            
            if (getKey(startSector) === getKey(goalSector))
                return [];
            
            visited.push(getKey(startSector));
            frontier.push(startSector);
            cameFrom[getKey(startSector)] = null;
            
            var pass = 0;
            var current;
            var neighbours;
            var next;
            mainLoop: while (frontier.length > 0) {
                pass++;
                current = frontier.shift();
                neighbours = this.getSectorNeighboursMap(current);
                for (var direction in neighbours) {
                    var next = neighbours[direction];
                    if (!next)
                        continue;
                    var neighbourKey = getKey(next);
                    if (visited.indexOf(neighbourKey) >= 0)
                        continue;
                    if (!isValid(next, current, parseInt(direction)))
                        continue;
                    visited.push(neighbourKey);
                    frontier.push(next);
                    cameFrom[neighbourKey] = current;
                    
                    if (next === goalSector) {
                        break mainLoop;
                    }
                }
            }
            
            var result = [];
            var current = goalSector;
            while (current !== startSector) {
                result.push(current);
                current = cameFrom[getKey(current)];
                if (!current || result.length > 500) {
                    console.log("WARN: Failed to find path from " + getKey(startSector) + " to " + getKey(goalSector));
                    break;
                }
            }
            return result.reverse();
        },
        
        findPassageUp: function (level, includeUnbuiltPassages) {
            var levelEntity = this.getLevelEntityForPosition(level);
			var levelPassagesComponent = levelEntity.get(LevelPassagesComponent);            
			var passageSectors = Object.keys(levelPassagesComponent.passagesUpBuilt);
            var level = levelEntity.get(PositionComponent).level;
            var sectorId;
            for (var iu = 0; iu < passageSectors.length; iu++) {
                sectorId = passageSectors[iu];
                if (includeUnbuiltPassages || levelPassagesComponent.passagesUpBuilt[sectorId]) {
                    return this.getSectorByPosition(level, sectorId.split(".")[0], sectorId.split(".")[1]);
                }
            }
            return null;
        },
        
        findPassageDown: function (level, includeUnbuiltPassages) {
            var levelEntity = this.getLevelEntityForPosition(level);
			var levelPassagesComponent = levelEntity.get(LevelPassagesComponent);         
			var passageSectors = Object.keys(levelPassagesComponent.passagesDownBuilt);
            var level = levelEntity.get(PositionComponent).level;
            var sectorId;
            for (var iu = 0; iu < passageSectors.length; iu++) {
                sectorId = passageSectors[iu];
                if (includeUnbuiltPassages || levelPassagesComponent.passagesDownBuilt[sectorId]) {
                    return this.getSectorByPosition(level, sectorId.split(".")[0], sectorId.split(".")[1]);
                }
            }
            return null;
        },
        
        forEverySectorFromLocation: function (playerPosition, func) {
            
            // TODO go by path distance, not distance in coordinates
            
			var doLevel = function (level) {
                if (!this.isLevelUnlocked(level))
                    return;
                // spiralling search: find sectors closest to current position first
                var levelComponent = this.getLevelEntityForPosition(level).get(LevelComponent);
                var levelVO = levelComponent.levelVO;
                var checkPos = playerPosition.clone();
                var spiralRadius = 0;
                var spiralEdgeLength;
                while ((checkPos.sectorX >= levelVO.minX && checkPos.sectorX <= levelVO.maxX) || (checkPos.sectorY >= levelVO.minY && checkPos.sectorY <= levelVO.maxY)) {
                    spiralEdgeLength = spiralRadius * 2 + 1;
                    checkPos = new PositionVO(playerPosition.level, playerPosition.sectorX - spiralRadius, playerPosition.sectorY - spiralRadius);
                    for (var spiralEdge = 0; spiralEdge < 4; spiralEdge++) {
                        for (var spiralEdgeI = 0; spiralEdgeI < spiralEdgeLength; spiralEdgeI++) {
                            if (spiralEdgeI > 0) {
                                if (spiralEdge === 0) checkPos.sectorX++;
                                if (spiralEdge === 1) checkPos.sectorY++;
                                if (spiralEdge === 2) checkPos.sectorX--;
                                if (spiralEdge === 3) checkPos.sectorY--;

                                var sector = this.getSectorByPosition(level, checkPos.sectorX, checkPos.sectorY);
                                if (sector) {
                                    var isDone = func(sector);
                                    if (isDone) {
                                        return true;
                                    }
                                }
                            }
                        }
                        spiralRadius++;
                    }
                }
                
                return false;
            };
            
			var currentLevel = playerPosition.level;
            var isDone;
			for (var ld = 0; ld < WorldCreatorConstants.LEVEL_NUMBER_MAX; ld++) {
                if (ld === 0) {
                    isDone = doLevel.call(this, currentLevel);
                } else {
    				isDone = doLevel.call(this, currentLevel + ld);
        			isDone = isDone || doLevel.call(this, currentLevel - ld);
                }
                
                if (isDone)
                    break;
			}
        },
        
		getAvailableProjectsForCamp: function (sectorEntity) {
			var projects = [];
			
			// use to get projects only for that level: (now displaying all available projects in all camps)
			// var campLevelEntity = this.getLevelEntityForSector(sectorEntity);
			
			// get all levels
            var levelProjects;
			for (var node = this.levelNodes.head; node; node = node.next) {
                levelProjects = this.getProjectsForLevel(node.entity, false);
				projects = projects.concat(levelProjects);
			}
            
            var result = this.filterProjects(projects);
			
			return result;
		},
        
        getBuiltProjectsForCamp: function (sectorEntity) {
			var projects = [];            
			
			// use to get projects only for that level: (now displaying all projects in all camps)
			// var campLevelEntity = this.getLevelEntityForSector(sectorEntity);            
			
			// get all levels
            var levelProjects;
			for (var node = this.levelNodes.head; node; node = node.next) {
                levelProjects = this.getProjectsForLevel(node.entity, true);
				projects = projects.concat(levelProjects);
			}
            
            var result = this.filterProjects(projects);
			return result;
        },
        
        filterProjects: function (projects) {
            var result = [];
			var project;
			var projectExists;
			var existingProject;
			
			// sort by level ordinal
			var gameState = this.gameState;
			result.sort(function (a, b) {
				var levelOrdinalA = gameState.getLevelOrdinal(a.level);
				var levelOrdinalB = gameState.getLevelOrdinal(b.level);
				return levelOrdinalB - levelOrdinalA;
			});
            
			// filter duplicates (corresponding up and down)
			for (var i = 0; i < projects.length; i++) {
				project = projects[i];
				projectExists = false;
				for (var j = 0; j < result.length; j++) {
					existingProject = result[j];
					if (existingProject.sector === project.sector && (existingProject.level - 1 === project.level || existingProject.level + 1 === project.level)) {
						projectExists = true;
						break;
					}
				}
				if (!projectExists) 
                    result.push(project);
			}
            
            return result;
        },
        
        getLevelStats: function (level) {
            var levelStats = {};
            levelStats.totalSectors = 0;
            levelStats.countClearedSectors = 0;
            levelStats.countScoutedSectors = 0;
            levelStats.countRevealedSectors = 0;
            
            var sectorPosition;
            var statusComponent;
            var sectorStatus;
			for (var node = this.sectorNodes.head; node; node = node.next) {
				sectorPosition = node.entity.get(PositionComponent);
                sectorStatus = SectorConstants.getSectorStatus(node.entity, this);
				if (sectorPosition.level !== level) continue;
                levelStats.totalSectors++;
                
                statusComponent = node.entity.get(SectorStatusComponent);
                if (sectorStatus === SectorConstants.MAP_SECTOR_STATUS_VISITED_CLEARED) levelStats.countClearedSectors++;
                if (statusComponent.scouted) levelStats.countScoutedSectors++;
                if (node.entity.has(RevealedComponent)) levelStats.countRevealedSectors++;
            }
            
            levelStats.percentClearedSectors = levelStats.countClearedSectors / levelStats.totalSectors;
            levelStats.percentScoutedSectors = levelStats.countScoutedSectors / levelStats.totalSectors;
            levelStats.percentRevealedSectors = levelStats.countRevealedSectors / levelStats.totalSectors;
            
            return levelStats;
        },
		
		getProjectsForLevel: function (levelEntity, getBuilt) {
			var projects = [];
			var level = levelEntity.get(PositionComponent).level;
			var levelPassagesComponent = levelEntity.get(LevelPassagesComponent);
            
            this.saveSectorsForLevel(level);
            
            var sectorPosition;
			for (var i = 0; i < this.sectorEntitiesByLevel[level].length; i++) {
				sectorPosition = this.sectorEntitiesByLevel[level][i].get(PositionComponent);
				if (sectorPosition.level !== level) continue;
				projects = projects.concat(
                    getBuilt ?
                    this.getBuiltProjectsForSector(this.sectorEntitiesByLevel[level][i]) :
                    this.getAvailableProjectsForSector(this.sectorEntitiesByLevel[level][i], levelPassagesComponent)
                );
			}
			
			return projects;
		},
        
        getAvailableProjectsForSector: function (sectorEntity, levelPassagesComponent) {
            var projects = [];
			var sectorPosition = sectorEntity.get(PositionComponent);
            var statusComponent = sectorEntity.get(SectorStatusComponent);
            var sectorPassagesComponent = sectorEntity.get(PassagesComponent);
            var levelOrdinal = this.gameState.getLevelOrdinal(sectorPosition.level);
            
            var scouted = statusComponent && statusComponent.scouted;
            if (!scouted) return projects;
            
            levelPassagesComponent = levelPassagesComponent || this.getLevelEntityForPosition(sectorPosition.level).get(LevelPassagesComponent);
            
            var improvementName = "";
            var actionName = "";
            var actionLabel;
            
            // passages
            if (levelPassagesComponent.passagesUp[sectorPosition.sectorId()] && !levelPassagesComponent.passagesUpBuilt[sectorPosition.sectorId()]) {
                switch (levelPassagesComponent.passagesUp[sectorPosition.sectorId()].type) {
                    case 1:
                        improvementName = improvementNames.passageUpHole;
                        actionName = "build_out_passage_up_hole";
                        actionLabel = "build";
                        break;
                    case 2:
                        improvementName = improvementNames.passageUpElevator;
                        actionName = "build_out_passage_up_elevator";
                        actionLabel = "repair";
                        break;
                    case 3:
                        improvementName = improvementNames.passageUpStairs;
                        actionName = "build_out_passage_up_stairs";
                        actionLabel = "repair";
                        break;
                }
                if (this.playerActionsHelper.checkRequirements(actionName, false, sectorEntity).value > 0) {
                    actionName = actionName + "_" + levelOrdinal;
                    projects.push(new LevelProjectVO(new ImprovementVO(improvementName), actionName, sectorPosition, PositionConstants.DIRECTION_UP, null, actionLabel));
                }
            }
            
            if (levelPassagesComponent.passagesDown[sectorPosition.sectorId()] && !levelPassagesComponent.passagesDownBuilt[sectorPosition.sectorId()]) {
                switch (levelPassagesComponent.passagesDown[sectorPosition.sectorId()].type) {
                    case MovementConstants.PASSAGE_TYPE_HOLE:
                        improvementName = improvementNames.passageDownHole;
                        actionName = "build_out_passage_down_hole";
                        actionLabel = "repair";
                        break;
                    case MovementConstants.PASSAGE_TYPE_ELEVATOR:
                        improvementName = improvementNames.passageDownElevator;
                        actionName = "build_out_passage_down_elevator";
                        actionLabel = "repair";
                        break;
                    case MovementConstants.PASSAGE_TYPE_STAIRWELL:
                        improvementName = improvementNames.passageDownStairs;
                        actionName = "build_out_passage_down_stairs";
                        actionLabel = "repair";
                        break;
                }
                
                if (this.playerActionsHelper.checkRequirements(actionName, false, sectorEntity).value > 0) {
                    actionName = actionName + "_" + levelOrdinal;
                    projects.push(new LevelProjectVO(new ImprovementVO(improvementName), actionName, sectorPosition, PositionConstants.DIRECTION_DOWN, null, actionLabel));
                }
            }
            
            // bridges
            for (var i in PositionConstants.getLevelDirections()) {
                var direction = PositionConstants.getLevelDirections()[i];
                var directionBlocker = sectorPassagesComponent.getBlocker(direction);
                if (directionBlocker && directionBlocker.bridgeable) {
                    actionName = actionName + "_" + levelOrdinal;
                    projects.push(new LevelProjectVO(new ImprovementVO(improvementNames.bridge), "build_out_bridge", sectorPosition, direction));
                }
            }
            
            // space ship
            if (levelOrdinal === this.gameState.getSurfaceLevelOrdinal()) {
                var camp = sectorEntity.get(CampComponent);
                if (camp) {
                    var actions = [ "build_out_spaceship1", "build_out_spaceship2", "build_out_spaceship3"];
                    for (var i = 0; i < actions.length; i++) {
                        if (this.playerActionsHelper.checkRequirements(actions[i])) {
                            var improvement = this.playerActionsHelper.getImprovementNameForAction(actions[i]);
                            projects.push(new LevelProjectVO(new ImprovementVO(improvement), actions[i], sectorPosition));
                        }
                    }
                }
            }
            
            return projects;
        },
        
        getBuiltProjectsForSector: function (sectorEntity) {
            var projects = [];
            var statusComponent = sectorEntity.get(SectorStatusComponent);
            var scouted = statusComponent && statusComponent.scouted;
            if (!scouted) return projects;
            
			var sectorPosition = sectorEntity.get(PositionComponent);
            var sectorImprovements = sectorEntity.get(SectorImprovementsComponent);            
			var improvementList = sectorImprovements.getAll(improvementTypes.level);
            for (var i = 0; i < improvementList.length; i++) {
                var improvement = improvementList[i];
                if (improvement.name === improvementNames.collector_food) continue;
                if (improvement.name === improvementNames.collector_water) continue;
                projects.push(new LevelProjectVO(improvement, "", sectorPosition));
            }
            
            return projects;
        },
		
        getLevelClearedWorkshopCount: function (level, resourceName) {
			var count = 0;
            var featuresComponent;
            var sectorControlComponent;
			var workshopComponent;
            for (var node = this.sectorNodes.head; node; node = node.next) {
                if (node.entity.get(PositionComponent).level === level) {
                    featuresComponent = node.entity.get(SectorFeaturesComponent);
                    sectorControlComponent = node.entity.get(SectorControlComponent);
					workshopComponent = node.entity.get(WorkshopComponent);
                    if (workshopComponent && workshopComponent.resource === resourceName) {
                        if (sectorControlComponent && sectorControlComponent.hasControlOfLocale(LocaleConstants.LOCALE_ID_WORKSHOP)) {
                            count++;
                        }
                    }
                }
            }
            return count;
        },
		
		getSectorUnclearedWorkshopCount: function (sectorEntity) {
			var count = 0;
            var featuresComponent;
            var sectorControlComponent;
			featuresComponent = sectorEntity.get(SectorFeaturesComponent);
			sectorControlComponent = sectorEntity.get(SectorControlComponent);
			if (sectorEntity.has(WorkshopComponent)) {
				if (!sectorControlComponent.hasControlOfLocale(LocaleConstants.LOCALE_ID_WORKSHOP)) {
					count++;
				}
			}
            return count;
		},
		
		isLevelUnlocked: function (level) {
			if (level === 13) return true;
			
			var levelEntity = this.getLevelEntityForPosition(level);
			if (levelEntity) {
				var levelPassagesComponent = levelEntity.get(LevelPassagesComponent);
				var passageSectors;
				if (level < 13) {
					passageSectors = Object.keys(levelPassagesComponent.passagesUpBuilt);
					for (var iu = 0; iu < passageSectors.length; iu++) {
						if (levelPassagesComponent.passagesUpBuilt[passageSectors[iu]]) return true;
					}
				}
				
				if (level > 13) {
					passageSectors = Object.keys(levelPassagesComponent.passagesDownBuilt);
					for (var id = 0; id < passageSectors.length; id++) {
						if (levelPassagesComponent.passagesDownBuilt[passageSectors[id]]) return true;
					}
				}
			}
			
			return false;
		},
		
		getLevelLocales: function (level, includeScouted, includeHard, excludeLocaleVO) {
			var locales = [];
			var sectorPosition;
			for (var node = this.sectorNodes.head; node; node = node.next) {
				sectorPosition = node.entity.get(PositionComponent);
				if (sectorPosition.level === level) {
					locales = locales.concat(this.getSectorLocales(node.entity, includeScouted, includeHard, excludeLocaleVO));
				}
			}
			return locales;
		},
		
		getSectorLocales: function (sectorEntity, includeScouted, includeHard, excludeLocaleVO) {
			var locales = [];
			var sectorLocalesComponent = sectorEntity.get(SectorLocalesComponent);
			var sectorStatus = sectorEntity.get(SectorStatusComponent);
			var locale;
			for (var i = 0; i < sectorLocalesComponent.locales.length; i++) {
				locale = sectorLocalesComponent.locales[i];
				if (locale !== excludeLocaleVO && (includeScouted || !sectorStatus.isLocaleScouted(i)) && (includeHard || locale.isEasy))
					locales.push(locale);
			}
			return locales;
		},
		
		getSectorLocalesForPlayer: function (sectorEntity) {
			var locales = [];
			var sectorLocalesComponent = sectorEntity.get(SectorLocalesComponent);
			var sectorStatus = sectorEntity.get(SectorStatusComponent);
			var locale;
			for (var i = 0; i < sectorLocalesComponent.locales.length; i++) {
				locale = sectorLocalesComponent.locales[i];
				var action = "scout_locale_" + locale.getCategory() + "_" + i;
				if (!sectorStatus.isLocaleScouted(i)) {
					if (this.playerActionsHelper.checkAvailability(action, true, sectorEntity))
						locales.push(locale);
                }
			}
			return locales;
		},
		
        saveSectorsForLevel: function (level) {
            if (this.sectorEntitiesByLevel[level] && this.sectorEntitiesByLevel[level] !== null && this.sectorEntitiesByLevel[level].length > 0) {
                return;
            }            
            
            this.sectorEntitiesByLevel[level] = [];
            
            var sectorPosition;
            for (var node = this.sectorNodes.head; node; node = node.next) {
                sectorPosition = node.entity.get(PositionComponent);
                if (sectorPosition.level !== level)
                    continue;
                this.sectorEntitiesByLevel[level].push(node.entity);
            }
        }
        
    });
    
    return LevelHelper;
});